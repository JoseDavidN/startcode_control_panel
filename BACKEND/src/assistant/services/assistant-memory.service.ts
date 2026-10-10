import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiAssistantMessage, AiMessageRole } from '../entities/ai-assistant-message.entity';
import { AiAssistantMemory } from '../entities/ai-assistant-memory.entity';
import { AiProvider } from '../entities/ai-assistant-config.entity';
import { AiProviderService, ProviderMessage } from './ai-provider.service';
import { hidePanelInternals, stripPanelInstructions } from './panel-guard';

/** Mensajes recientes que se reenvían literales al modelo. */
const RECENT_LIMIT = 30;
/** Al pasar de aquí sin resumir, lo más antiguo se condensa en el resumen… */
const SUMMARIZE_ABOVE = 40;
/** …y quedan literales estos. */
const KEEP_AFTER_SUMMARY = 20;
/** Tope del resumen: lo que no quepa es lo menos importante. */
const MAX_SUMMARY_CHARS = 8_000;
/** Mensajes que se guardan por usuario para mostrar el historial. */
const MAX_STORED = 400;

const SUMMARY_PROMPT = `Mantienes la memoria a largo plazo del asistente de StartCode Panel para un único usuario.
Recibes el resumen anterior (puede estar vacío) y una parte antigua de la conversación. Devuelve el resumen actualizado, en español, en viñetas breves, con lo que conviene recordar en conversaciones futuras:
- preferencias y forma de trabajar del usuario;
- servidores, bases de datos, servicios y rutas relevantes, y su estado o problemas conocidos;
- decisiones tomadas, problemas resueltos y cómo, tareas pendientes.
Descarta saludos y detalles sin valor futuro. Nunca incluyas contraseñas, llaves, tokens ni claves de API, ni rutas o detalles internos de StartCode Panel. Máximo ${MAX_SUMMARY_CHARS} caracteres. Devuelve solo el resumen.`;

export interface MemoryState {
  summary: string;
  recent: ProviderMessage[];
}

/**
 * Memoria del asistente, independiente del proveedor: la conversación se
 * guarda como texto en la base del panel y lo antiguo se condensa en un
 * resumen. Cada pregunta lleva el resumen y los últimos mensajes, así que
 * cambiar de Claude a ChatGPT o Gemini no pierde el contexto.
 */
@Injectable()
export class AssistantMemoryService {
  private readonly logger = new Logger(AssistantMemoryService.name);
  /* Un resumen a la vez por usuario: dos preguntas seguidas no lo duplican. */
  private readonly summarizing = new Set<string>();

  constructor(
    @InjectRepository(AiAssistantMessage) private readonly messages: Repository<AiAssistantMessage>,
    @InjectRepository(AiAssistantMemory) private readonly memory: Repository<AiAssistantMemory>,
    private readonly providers: AiProviderService,
  ) {}

  /** Resumen y mensajes recientes sin resumir, listos para el proveedor. */
  async load(userId: string): Promise<MemoryState> {
    const [mem, recent] = await Promise.all([
      this.memory.findOne({ where: { userId } }),
      this.messages.find({
        where: { userId, summarized: false },
        order: { createdAt: 'DESC' },
        take: RECENT_LIMIT,
      }),
    ]);
    /* También sobre lo ya guardado: respuestas anteriores a la barrera no deben reenviarse con rutas internas. */
    return {
      summary: hidePanelInternals(mem?.summary ?? ''),
      recent: toAlternating(
        recent.reverse().map(m => ({
          role: m.role,
          content: m.role === AiMessageRole.ASSISTANT ? stripPanelInstructions(m.content) : hidePanelInternals(m.content),
        })),
      ),
    };
  }

  /** Historial para mostrar en el panel, del más antiguo al más nuevo. */
  async history(userId: string, limit: number) {
    const rows = await this.messages.find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit });
    return rows.reverse().map(m => ({
      id: m.id,
      role: m.role,
      content: m.role === AiMessageRole.ASSISTANT ? stripPanelInstructions(m.content) : m.content,
      provider: m.provider,
      model: m.model,
      createdAt: m.createdAt,
    }));
  }

  async status(userId: string) {
    const [mem, total] = await Promise.all([
      this.memory.findOne({ where: { userId } }),
      this.messages.count({ where: { userId } }),
    ]);
    return { summary: mem?.summary ?? '', messageCount: total, updatedAt: mem?.updatedAt ?? null };
  }

  async append(
    userId: string,
    role: AiMessageRole,
    content: string,
    meta: { provider?: AiProvider; model?: string } = {},
  ): Promise<AiAssistantMessage> {
    return this.messages.save(
      this.messages.create({ userId, role, content, provider: meta.provider ?? null, model: meta.model ?? null }),
    );
  }

  async remove(id: string): Promise<void> {
    await this.messages.delete({ id });
  }

  async clear(userId: string): Promise<void> {
    await Promise.all([this.messages.delete({ userId }), this.memory.delete({ userId })]);
  }

  /**
   * Si hay demasiado sin resumir, condensa lo antiguo con el proveedor del
   * usuario. No bloquea la respuesta y un fallo solo deja el resumen para la
   * próxima vez.
   */
  compact(userId: string, provider: { provider: AiProvider; model: string; apiKey: string }): void {
    if (this.summarizing.has(userId)) return;
    this.summarizing.add(userId);
    this.doCompact(userId, provider)
      .catch(err => this.logger.warn(`No se pudo resumir la memoria de ${userId}: ${(err as Error)?.message ?? err}`))
      .finally(() => this.summarizing.delete(userId));
  }

  private async doCompact(userId: string, p: { provider: AiProvider; model: string; apiKey: string }): Promise<void> {
    const pending = await this.messages.find({ where: { userId, summarized: false }, order: { createdAt: 'ASC' } });
    if (pending.length <= SUMMARIZE_ABOVE) return;

    const old = pending.slice(0, pending.length - KEEP_AFTER_SUMMARY);
    const mem = (await this.memory.findOne({ where: { userId } })) ?? this.memory.create({ userId, summary: '', summarizedCount: 0 });
    const transcript = old.map(m => `${m.role === AiMessageRole.USER ? 'Usuario' : 'Asistente'}: ${m.content}`).join('\n\n');

    const { text: summary } = await this.providers.complete({
      ...p,
      system: SUMMARY_PROMPT,
      messages: [
        {
          role: 'user',
          content: `<resumen_anterior>\n${mem.summary || '(vacío)'}\n</resumen_anterior>\n\n<conversacion_antigua>\n${transcript}\n</conversacion_antigua>`,
        },
      ],
      maxTokens: 4000,
    });
    if (!summary.trim()) return;

    mem.summary = hidePanelInternals(summary.trim()).slice(0, MAX_SUMMARY_CHARS);
    mem.summarizedCount += old.length;
    await this.memory.save(mem);
    await this.messages.update({ id: In(old.map(m => m.id)) }, { summarized: true });
    await this.prune(userId);
  }

  /** Borra lo ya resumido que exceda el tope de historial guardado. */
  private async prune(userId: string): Promise<void> {
    const extra = await this.messages.find({
      where: { userId, summarized: true },
      order: { createdAt: 'DESC' },
      skip: MAX_STORED,
      select: { id: true },
    });
    if (extra.length) await this.messages.delete({ id: In(extra.map(m => m.id)) });
  }
}

/**
 * Historial que aceptan los tres proveedores: empieza por el usuario y
 * alterna roles (Gemini y Anthropic no admiten dos turnos seguidos del
 * mismo rol sin unirlos). Los consecutivos del mismo rol se juntan.
 */
export function toAlternating(rows: { role: AiMessageRole | string; content: string }[]): ProviderMessage[] {
  const out: ProviderMessage[] = [];
  for (const r of rows) {
    const role = String(r.role) === 'assistant' ? 'assistant' : 'user';
    if (!out.length && role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${r.content}`;
    else out.push({ role, content: r.content });
  }
  /* La pregunta nueva va después: el historial no puede acabar en el usuario. */
  while (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}
