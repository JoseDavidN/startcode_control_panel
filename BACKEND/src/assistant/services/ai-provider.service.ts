import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { AiProvider } from '../entities/ai-assistant-config.entity';
import type { ChatRole } from '../dto/assistant-chat.dto';

export interface ProviderMessage {
  role: ChatRole;
  content: string;
}

export interface ProviderRequest {
  provider: AiProvider;
  model: string;
  apiKey: string;
  system: string;
  messages: ProviderMessage[];
  maxTokens?: number;
}

/** Texto de la respuesta y modelo que la escribió (puede ser el de respaldo). */
export interface ProviderReply {
  text: string;
  model: string;
}

/**
 * El proveedor no pudo atender ahora (saturado o sin responder a tiempo).
 * Distinto de un error de clave o de modelo: tiene sentido probar otro modelo.
 */
export class ProviderUnavailableError extends BadGatewayException {}

/**
 * El proveedor lista el modelo pero ya no lo da a esta cuenta (Google retira
 * los `gemini-2.5-*` para cuentas nuevas y responde 404). Lleva el modelo
 * que el proveedor recomienda en su lugar, si lo dice.
 */
export class ModelRetiredError extends BadRequestException {
  constructor(
    message: string,
    readonly replacement: string | null,
  ) {
    super(message);
  }
}

export interface ProviderModel {
  id: string;
  name: string;
}

const DEFAULT_MAX_TOKENS = 8000;
const LIST_TIMEOUT_MS = 15_000;
/* Errores pasajeros del proveedor (sobrecarga, reinicio): se reintenta con espera creciente. */
const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1_500, 4_000];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/* OpenAI lista todo (audio, imágenes, embeddings…): solo sirven los de chat. */
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/i;
const OPENAI_NOT_CHAT = /(audio|realtime|transcribe|tts|image|embedding|search|moderation|instruct|codex|computer-use|-\d{4}-\d{2}-\d{2}$)/i;
const REQUEST_TIMEOUT_MS = 120_000;

/* Gemini: el modelo elegido tiene 70 s (con un reintento) y, si está
   saturado, uno estable de respaldo tiene 45 s. Juntos quedan por debajo de
   los 150 s que espera la app. */
const GEMINI_PRIMARY_TIMEOUT_MS = 70_000;
const GEMINI_FALLBACK_TIMEOUT_MS = 45_000;
/* Alias que Google mantiene apuntando al modelo vigente: no se retiran como los versionados. */
const GEMINI_FALLBACKS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
/* Lo que el respaldo puede tardar en total, para no pasar de los 150 s de la app. */
const GEMINI_TOTAL_BUDGET_MS = 115_000;

/* Claves de usuario (`sk-ant-usr-…`) sin espacio de trabajo: Anthropic exige elegir uno en cada petición. */
const WORKSPACE_KEY_MESSAGE =
  'Esta clave de Anthropic es de usuario y no pertenece a un espacio de trabajo. Crea una clave de API de un espacio de trabajo (empieza por sk-ant-api) en console.anthropic.com → Settings → API keys';

const keyTag = (apiKey: string) => createHash('sha256').update(apiKey).digest('hex').slice(0, 16);

/**
 * Llama al proveedor elegido por el usuario y devuelve solo texto.
 *
 * No se declaran herramientas en ningún proveedor: el asistente no puede
 * ejecutar nada, solo responder. Anthropic va por su SDK oficial; OpenAI y
 * Gemini, por su API REST.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  /* Modelos que el proveedor rechazó por retirados, por clave (huella, nunca la clave):
     la lista de modelos los oculta desde entonces. Se vacía al reiniciar. */
  private readonly retired = new Map<string, Set<string>>();

  /** El proveedor ya rechazó este modelo para esta clave por retirado. */
  isRetired(apiKey: string, model: string): boolean {
    return this.retired.get(keyTag(apiKey))?.has(model) ?? false;
  }

  private markRetired(apiKey: string, model: string): void {
    const tag = keyTag(apiKey);
    const set = this.retired.get(tag) ?? new Set<string>();
    set.add(model);
    this.retired.set(tag, set);
  }

  async complete(req: ProviderRequest): Promise<ProviderReply> {
    switch (req.provider) {
      case AiProvider.ANTHROPIC:
        return { text: await this.anthropic(req), model: req.model };
      case AiProvider.OPENAI:
        return { text: await this.openai(req), model: req.model };
      case AiProvider.GEMINI:
        return this.geminiWithFallback(req);
      default:
        throw new BadRequestException('Proveedor no soportado');
    }
  }

  /**
   * Modelos de texto disponibles para esa clave, tal como los publica el
   * proveedor en este momento: el selector de Configuración no lleva una
   * lista fija que se quede vieja.
   */
  async listModels(provider: AiProvider, apiKey: string): Promise<ProviderModel[]> {
    switch (provider) {
      case AiProvider.ANTHROPIC:
        return this.anthropicModels(apiKey);
      case AiProvider.OPENAI:
        return this.openaiModels(apiKey);
      case AiProvider.GEMINI:
        return this.geminiModels(apiKey);
      default:
        throw new BadRequestException('Proveedor no soportado');
    }
  }

  private async anthropicModels(apiKey: string): Promise<ProviderModel[]> {
    const client = new Anthropic({ apiKey, timeout: LIST_TIMEOUT_MS, maxRetries: 1 });
    try {
      const out: ProviderModel[] = [];
      /* La API los devuelve del más nuevo al más antiguo. */
      for await (const m of client.models.list({ limit: 100 })) {
        if (m.deprecated_at) continue;
        out.push({ id: m.id, name: m.display_name || m.id });
      }
      return out;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new BadRequestException('Anthropic rechazó la clave de API');
      }
      if (err instanceof Anthropic.BadRequestError && /not scoped to a workspace/i.test(err.message)) {
        throw new BadRequestException(WORKSPACE_KEY_MESSAGE);
      }
      if (err instanceof Anthropic.APIConnectionError) throw this.network('Anthropic', err, LIST_TIMEOUT_MS);
      if (err instanceof Anthropic.APIError) {
        this.logger.warn(`Anthropic models ${err.status}: ${err.message}`);
        throw new BadGatewayException(`Anthropic respondió con un error (${err.status ?? 'sin estado'})`);
      }
      throw this.network('Anthropic', err);
    }
  }

  private async openaiModels(apiKey: string): Promise<ProviderModel[]> {
    const data = await this.getJson<{ data?: { id: string; created?: number }[] }>(
      'OpenAI',
      'https://api.openai.com/v1/models',
      { Authorization: `Bearer ${apiKey}` },
    );
    return (data.data ?? [])
      .filter(m => OPENAI_CHAT.test(m.id) && !OPENAI_NOT_CHAT.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map(m => ({ id: m.id, name: m.id }));
  }

  private async geminiModels(apiKey: string): Promise<ProviderModel[]> {
    const out: ProviderModel[] = [];
    let pageToken = '';
    /* Paginado; con 5 páginas de 1000 sobra. */
    for (let page = 0; page < 5; page++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const data = await this.getJson<{
        models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
        nextPageToken?: string;
      }>('Gemini', url, { 'x-goog-api-key': apiKey });
      for (const m of data.models ?? []) {
        const id = m.name.replace(/^models\//, '');
        if (!m.supportedGenerationMethods?.includes('generateContent')) continue;
        if (!/^gemini-/i.test(id) || /(embedding|image|tts|audio|live|aqa)/i.test(id)) continue;
        out.push({ id, name: m.displayName || id });
      }
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    return out;
  }

  private async anthropic(req: ProviderRequest): Promise<string> {
    /* El SDK ya reintenta 429, 5xx y 529 (sobrecarga) con espera exponencial. */
    const client = new Anthropic({ apiKey: req.apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 });
    try {
      const response = await client.beta.messages.create({
        model: req.model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: req.system,
        messages: req.messages.map(m => ({ role: m.role, content: m.content })),
        /* Si un clasificador de seguridad rechaza la petición, la API la
           reintenta en otro modelo dentro de la misma llamada. */
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (response.stop_reason === 'refusal') {
        throw new BadGatewayException('El modelo declinó responder a esta consulta');
      }
      return response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new BadRequestException('Anthropic rechazó la clave de API');
      }
      if (err instanceof Anthropic.NotFoundError) {
        throw new BadRequestException(`Anthropic no reconoce el modelo «${req.model}»`);
      }
      if (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 503)) {
        throw new ProviderUnavailableError('Anthropic está saturado en este momento. Reintenta en unos segundos o elige otro modelo');
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new BadGatewayException('Anthropic limitó las peticiones: espera un momento y reintenta');
      }
      if (err instanceof Anthropic.BadRequestError && /not scoped to a workspace/i.test(err.message)) {
        throw new BadRequestException(WORKSPACE_KEY_MESSAGE);
      }
      if (err instanceof Anthropic.BadRequestError && /credit balance is too low/i.test(err.message)) {
        throw new BadRequestException(
          'La cuenta de Anthropic no tiene saldo: la clave es válida, pero hay que comprar créditos en console.anthropic.com → Plans & Billing',
        );
      }
      if (err instanceof Anthropic.APIConnectionError) throw this.network('Anthropic', err, REQUEST_TIMEOUT_MS);
      if (err instanceof Anthropic.APIError) {
        this.logger.warn(`Anthropic ${err.status}: ${err.message}`);
        throw new BadGatewayException(`Anthropic respondió con un error (${err.status ?? 'sin estado'})`);
      }
      throw this.network('Anthropic', err);
    }
  }

  private async openai(req: ProviderRequest): Promise<string> {
    const body = {
      model: req.model,
      max_completion_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
    };
    const data = await this.postJson<{ choices?: { message?: { content?: string | null } }[] }>(
      'OpenAI',
      'https://api.openai.com/v1/chat/completions',
      { Authorization: `Bearer ${req.apiKey}` },
      body,
    );
    return (data.choices?.[0]?.message?.content ?? '').trim();
  }

  /**
   * Los modelos de Gemini en vista previa se saturan a menudo (503 «high
   * demand») y a veces ni responden. Si pasa con el elegido, se responde con
   * uno estable y se informa de cuál fue.
   */
  private async geminiWithFallback(req: ProviderRequest): Promise<ProviderReply> {
    const started = Date.now();
    try {
      return { text: await this.gemini(req, GEMINI_PRIMARY_TIMEOUT_MS, 1), model: req.model };
    } catch (err) {
      const retired = err instanceof ModelRetiredError;
      if (!retired && !(err instanceof ProviderUnavailableError)) throw err;

      /* Primero el que recomienda Google; luego los alias estables. */
      const candidates = [...new Set([retired ? err.replacement : null, ...GEMINI_FALLBACKS])]
        .filter((m): m is string => Boolean(m) && m !== req.model && !this.isRetired(req.apiKey, m!));
      for (const fallback of candidates) {
        const left = GEMINI_TOTAL_BUDGET_MS - (Date.now() - started);
        if (left < 10_000) break;
        this.logger.warn(`Gemini ${req.model} ${retired ? 'retirado' : 'no disponible'}; se responde con ${fallback}`);
        try {
          return { text: await this.gemini({ ...req, model: fallback }, Math.min(GEMINI_FALLBACK_TIMEOUT_MS, left), 0), model: fallback };
        } catch (fallbackErr) {
          this.logger.warn(`Gemini respaldo ${fallback}: ${(fallbackErr as Error)?.message ?? fallbackErr}`);
        }
      }
      /* Si ningún respaldo sirve, el error útil es el del modelo elegido. */
      throw err;
    }
  }

  private async gemini(req: ProviderRequest, timeoutMs: number, retries: number): Promise<string> {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS },
    };
    const data = await this.postJson<{
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    }>(
      'Gemini',
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
      { 'x-goog-api-key': req.apiKey },
      body,
      { timeoutMs, retries },
    ).catch((err: unknown) => {
      if (err instanceof ModelRetiredError) this.markRetired(req.apiKey, req.model);
      throw err;
    });
    if (data.promptFeedback?.blockReason) {
      throw new BadGatewayException('Gemini bloqueó esta consulta');
    }
    return (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim();
  }

  private postJson<T>(
    name: string,
    url: string,
    headers: Record<string, string>,
    body: unknown,
    opts: { timeoutMs?: number; retries?: number } = {},
  ): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    return this.requestJson<T>(
      name,
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      },
      opts.retries ?? RETRY_DELAYS_MS.length,
      timeoutMs,
    );
  }

  private getJson<T>(name: string, url: string, headers: Record<string, string>): Promise<T> {
    return this.requestJson<T>(name, url, { headers, signal: AbortSignal.timeout(LIST_TIMEOUT_MS) }, RETRY_DELAYS_MS.length, LIST_TIMEOUT_MS);
  }

  private async requestJson<T>(name: string, url: string, init: RequestInit, retries: number, timeoutMs: number): Promise<T> {
    let res: Response;
    let detail = '';
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(url, init);
      } catch (err) {
        throw this.network(name, err, timeoutMs);
      }
      if (res.ok) return (await res.json()) as T;

      detail = await res.text().catch(() => '');
      this.logger.warn(`${name} ${res.status} (intento ${attempt + 1}): ${detail.slice(0, 500)}`);
      /* La señal de tiempo límite es la misma en todos los intentos: el total no pasa del tope. */
      if (!TRANSIENT_STATUS.has(res.status) || attempt >= retries || init.signal?.aborted) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }

    if (res.status === 401 || res.status === 403) throw new BadRequestException(`${name} rechazó la clave de API`);
    if (res.status === 404 && /no longer available|deprecated|retired/i.test(detail)) {
      const replacement = /use models\/([\w.:-]+)/i.exec(detail)?.[1] ?? null;
      throw new ModelRetiredError(
        `${name} ya no ofrece este modelo a tu cuenta (retirado para cuentas nuevas)` +
          (replacement ? `. Recomienda usar ${replacement}` : '. Elige otro modelo de la lista'),
        replacement,
      );
    }
    if (res.status === 404) throw new BadRequestException(`${name} no reconoce el modelo indicado`);
    if (res.status === 400 && /api[_ ]?key/i.test(detail)) throw new BadRequestException(`${name} rechazó la clave de API`);
    if (res.status === 429) throw new BadGatewayException(`${name} limitó las peticiones o la cuenta no tiene saldo`);
    if (res.status === 503 || res.status === 504) {
      throw new ProviderUnavailableError(`${name} está saturado en este momento (${res.status}). Reintenta en unos segundos o elige otro modelo`);
    }
    throw new BadGatewayException(`${name} respondió con un error (${res.status})`);
  }

  private network(name: string, err: unknown, timeoutMs?: number): BadGatewayException {
    const e = err as (Error & { cause?: NetworkCause }) | undefined;
    const code = causeCode(e?.cause);
    this.logger.warn(`${name}: ${e?.message ?? String(err)}${code ? ` (${code})` : e?.cause?.message ? ` (${e.cause.message})` : ''}`);
    /* Un corte por tiempo no es «no se pudo contactar»: el proveedor recibió la petición y no contestó.
       El SDK de Anthropic avisa del suyo con APIConnectionTimeoutError. */
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || err instanceof Anthropic.APIConnectionTimeoutError) {
      const secs = timeoutMs ? ` en ${Math.round(timeoutMs / 1000)} s` : '';
      return new ProviderUnavailableError(`${name} no respondió${secs}; suele pasar cuando el modelo está saturado. Reintenta o elige un modelo más rápido`);
    }
    const hint = code ? (NETWORK_HINTS[code] ?? '') : '';
    return new BadGatewayException(
      `No se pudo contactar con ${name}${code ? ` (${code})` : ''}: ${hint || 'revisa la conexión a internet del servidor del panel'}`,
    );
  }
}

type NetworkCause = { code?: string; message?: string; errors?: NetworkCause[]; cause?: NetworkCause };

/* El código útil puede venir anidado: fetch → cause → AggregateError (un intento por IP). */
function causeCode(cause: NetworkCause | undefined, depth = 0): string | undefined {
  if (!cause || depth > 3) return undefined;
  return cause.code ?? causeCode(cause.errors?.[0], depth + 1) ?? causeCode(cause.cause, depth + 1);
}

/* Lo que suele significar cada fallo cuando el servidor del panel está detrás de una VPN. */
const NETWORK_HINTS: Record<string, string> = {
  ENOTFOUND: 'el servidor del panel no resuelve el dominio del proveedor; revisa el DNS que impone la VPN',
  EAI_AGAIN: 'el DNS no respondió; revisa el DNS que impone la VPN',
  ETIMEDOUT: 'la conexión no se completó a tiempo; si el servidor está en una VPN, comprueba que permita salir a internet (túnel completo o nodo de salida)',
  ECONNREFUSED: 'la conexión fue rechazada; puede que la VPN o un cortafuegos bloqueen la salida',
  ECONNRESET: 'la conexión se cortó; si el servidor está en una VPN, puede ser el MTU del túnel o un filtro de la VPN',
  ENETUNREACH: 'no hay ruta a internet; la VPN puede estar enviando todo el tráfico por un túnel sin salida',
  EHOSTUNREACH: 'no hay ruta a internet; la VPN puede estar enviando todo el tráfico por un túnel sin salida',
  UND_ERR_CONNECT_TIMEOUT: 'la conexión no se completó a tiempo; si el servidor está en una VPN, comprueba que permita salir a internet',
  UND_ERR_SOCKET: 'la conexión se cortó; si el servidor está en una VPN, puede ser el MTU del túnel o un filtro de la VPN',
  CERT_HAS_EXPIRED: 'el certificado recibido no es válido; la VPN o un proxy puede estar interceptando HTTPS',
  SELF_SIGNED_CERT_IN_CHAIN: 'la VPN o un proxy está interceptando HTTPS con su propio certificado; añádelo con NODE_EXTRA_CA_CERTS',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'la VPN o un proxy está interceptando HTTPS con su propio certificado; añádelo con NODE_EXTRA_CA_CERTS',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'la VPN o un proxy está interceptando HTTPS con su propio certificado; añádelo con NODE_EXTRA_CA_CERTS',
};
