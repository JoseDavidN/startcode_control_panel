import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAssistant } from '@hooks/useAssistantBridge';
import { useAssistantConfig, useAssistantMessages, useClearAssistantMemory, useSendAssistantMessage, useSummarizeAssistantMemory } from '@hooks/useAssistant';
import { notify } from '@services/notification.service';
import { copyText } from '@lib/clipboard';
import { ROUTES, STORAGE_KEYS } from '@utils/constants';
import { useAuth } from '@hooks/useAuth';
import type { AssistantTarget } from '@contexts/assistant-context';
import { AI_PROVIDERS, type AssistantTargetKind, type ChatMessage } from '@typings/assistant.types';
import { AddServerModal } from '@components/common/AddServerModal';
import { ConnectionModal } from '@components/databases/ConnectionModal';
import { AssistantActionCard } from '@components/assistant/AssistantAction';
import { parseAction, type AssistantAction } from '@components/assistant/assistantActions';

const sp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const SparkIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg {...sp} className={className}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></svg>
);
const CloseIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={className}><path d="M18 6L6 18M6 6l12 12" /></svg>;
const SendIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={className}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>;
const TrashIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={className}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>;
const CopyIcon = ({ className = 'w-3.5 h-3.5' }) => <svg {...sp} className={className}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>;
const PasteIcon = ({ className = 'w-3.5 h-3.5' }) => <svg {...sp} className={className}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /></svg>;
const EyeIcon = ({ className = 'w-3 h-3' }) => <svg {...sp} className={className}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const LockIcon = ({ className = 'w-3 h-3' }) => <svg {...sp} className={className}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>;

/** Tope de lo que se adjunta por fuente (~3000 tokens): lo más reciente es lo que importa. */
const MAX_SOURCE_CHARS = 12_000;

const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console', 'terminal']);

/* La consola de Redis se registra como destino `command`, pero solo recibe bloques de Redis. */
const isRedisConsole = (t: AssistantTarget) => t.id.startsWith('redis-console:');

/** Destinos que tienen sentido para el lenguaje del bloque. */
function targetsFor(lang: string, targets: AssistantTarget[]): AssistantTarget[] {
  const l = lang.toLowerCase();
  if (l === 'redis') return targets.filter(isRedisConsole);
  const kinds: AssistantTargetKind[] =
    l === 'sql' || l === 'mysql' || l === 'postgresql' || l === 'pgsql' ? ['sql']
      : SHELL_LANGS.has(l) ? ['terminal', 'command']
        : ['terminal', 'command', 'sql'];
  return targets.filter(t => kinds.includes(t.kind) && !isRedisConsole(t));
}

type Part = { kind: 'text'; text: string } | { kind: 'code'; lang: string; code: string };

/** Separa los bloques ```lang … ``` del texto. Un bloque sin cerrar llega hasta el final. */
function parseReply(text: string): Part[] {
  const parts: Part[] = [];
  const re = /```([\w+-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    parts.push({ kind: 'code', lang: m[1] ?? '', code: m[2].replace(/\n$/, '') });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** Texto con `código en línea` y **negritas**; el resto, tal cual. */
const InlineText = ({ text }: { text: string }) => {
  const tokens = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.startsWith('`') && t.endsWith('`') && t.length > 2) {
          return <code key={i} className="font-mono text-[12px] px-1 py-px rounded bg-tint-sunken text-violet-200">{t.slice(1, -1)}</code>;
        }
        if (t.startsWith('**') && t.endsWith('**') && t.length > 4) return <strong key={i} className="font-semibold text-white">{t.slice(2, -2)}</strong>;
        return <React.Fragment key={i}>{t}</React.Fragment>;
      })}
    </>
  );
};

const CodeBlock = ({ lang, code, targets }: { lang: string; code: string; targets: AssistantTarget[] }) => {
  const usable = targetsFor(lang, targets);
  const paste = (t: AssistantTarget) => {
    t.paste(code);
    notify.success(`Pegado en ${t.label}`, 'Revísalo antes de ejecutarlo: el asistente no ejecuta nada.');
  };
  return (
    <div className="rounded-xl border border-hairline-soft bg-tint-sunken overflow-hidden my-2">
      <div className="flex items-center gap-1 px-2.5 h-8 border-b border-line">
        <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">{lang || 'código'}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => void copyText(code).then(() => notify.success('Copiado')).catch(() => undefined)}
          title="Copiar"
          className="mo-tab h-6 px-2 rounded-md text-[11px] text-white/60 hover:text-white hover:bg-tint-hover inline-flex items-center gap-1">
          <CopyIcon /> Copiar
        </button>
        {usable.map(t => (
          <button key={t.id} type="button" onClick={() => paste(t)}
            title={`Pegar en ${t.label} sin ejecutar`}
            className="mo-tab h-6 px-2 rounded-md text-[11px] text-violet-200 hover:text-white hover:bg-tint-hover inline-flex items-center gap-1">
            <PasteIcon /> {t.label}
          </button>
        ))}
      </div>
      <pre className="p-3 text-xs font-mono text-white/85 whitespace-pre-wrap break-all max-h-72 overflow-y-auto scroll-thin">{code}</pre>
    </div>
  );
};

const Bubble = ({ message, targets, onReview }: { message: ChatMessage; targets: AssistantTarget[]; onReview: (a: AssistantAction) => void }) => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md grad-brand-soft border border-hairline px-3.5 py-2.5 text-sm text-white/90 whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <span className="w-7 h-7 rounded-lg grad-brand flex items-center justify-center shrink-0 elev-brand-sm text-white">
        <SparkIcon className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0 text-sm text-white/80 leading-relaxed">
        {parseReply(message.content).map((p, i) => {
          if (p.kind === 'code') {
            const action = parseAction(p.lang, p.code);
            return action
              ? <AssistantActionCard key={i} action={action} onReview={onReview} />
              : <CodeBlock key={i} lang={p.lang} code={p.code} targets={targets} />;
          }
          return <p key={i} className="whitespace-pre-wrap break-words"><InlineText text={p.text.replace(/^\n+|\n+$/g, '')} /></p>;
        })}
        {/* Quién respondió: la memoria es la misma aunque cambie el proveedor. */}
        {message.model && (
          <div className="text-[10px] text-white/30 mt-1 font-mono">
            {AI_PROVIDERS.find(p => p.id === message.provider)?.vendor ?? message.provider} · {message.model}
          </div>
        )}
      </div>
    </div>
  );
};

function errorText(err: unknown): string {
  const e = err as { message?: unknown } | null;
  return typeof e?.message === 'string' && e.message.trim() ? e.message : 'No se pudo contactar con el asistente';
}

const SUGGESTIONS = [
  '¿Qué servidores tienen problemas ahora mismo?',
  'Explícame la salida de la terminal',
  'Escribe una consulta para ver las tablas más pesadas',
  'Agrega una conexión PostgreSQL a 10.0.0.5',
];

/**
 * Asistente de IA flotante. Conversa: lee los datos del panel de la
 * cuenta (en el backend) y lo que la pantalla ofrece (terminal, línea de
 * comandos, editor y resultados SQL), y propone comandos o consultas que el
 * usuario puede pegar donde corresponda. También prepara altas de servidores y
 * conexiones (`AssistantAction`) que el usuario revisa y guarda en el
 * formulario de siempre. Nunca ejecuta ni crea nada por su cuenta.
 *
 * Va en portal y por encima de los modales (z-60) para poder consultarlo con
 * la terminal abierta. Se abre desde la barra superior (`AssistantLauncher`)
 * o desde la cabecera de la terminal.
 */
/* Comandos del chat: se escriben solos en la entrada (p. ej. `/resume`) y no se envían al modelo. */
const COMMANDS = [
  { name: '/clear', hint: 'Limpia la vista del chat; el asistente conserva la conversación y la memoria' },
  { name: '/resume', hint: 'Guarda la conversación en la memoria del asistente y limpia el chat' },
] as const;
type CommandName = typeof COMMANDS[number]['name'];

/* `/clear` solo oculta: se guarda en el equipo la fecha del último mensaje visto
   (la del servidor, no la del reloj local) y se muestran los posteriores. */
const readCleared = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const writeCleared = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* bloqueado: solo dura esta sesión */ }
};

export const AssistantPanel: React.FC = () => {
  const navigate = useNavigate();
  const { open, setOpen, sources, targets } = useAssistant();
  const { data: config, isLoading } = useAssistantConfig();
  /* La conversación es la memoria del backend: sigue ahí al recargar, en otro equipo o con otro proveedor. */
  const { data: messages = [] } = useAssistantMessages(open);
  const { user } = useAuth();
  const clearedKey = `${STORAGE_KEYS.ASSISTANT_CLEARED}${user?.id ?? ''}`;
  const [clearedAt, setClearedAt] = useState(() => readCleared(clearedKey));
  useEffect(() => { setClearedAt(readCleared(clearedKey)); }, [clearedKey]);
  /* Lo que se ve: lo posterior al último `/clear`. El backend sigue usándolo todo como contexto. */
  const visible = useMemo(
    /* La pregunta en vuelo lleva la hora local: se muestra siempre. */
    () => (clearedAt ? messages.filter(m => m.id.startsWith('pending-') || Date.parse(m.createdAt) > Date.parse(clearedAt)) : messages),
    [messages, clearedAt],
  );
  const chat = useSendAssistantMessage();
  const clear = useClearAssistantMemory();
  const summarize = useSummarizeAssistantMemory();
  const [confirmClear, setConfirmClear] = useState(false);
  const [input, setInput] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  /* Alta propuesta por el asistente que el usuario está revisando en el formulario. */
  const [reviewing, setReviewing] = useState<AssistantAction | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const provider = AI_PROVIDERS.find(p => p.id === config?.provider);
  const ready = Boolean(config?.enabled);

  /* Al abrir, directo al final sin animación: la conversación ya está en caché y el efecto de abajo no se dispara. */
  useLayoutEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, chat.isPending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const activeSources = useMemo(() => sources.filter(s => !excluded.has(s.id)), [sources, excluded]);

  /* Mientras se escribe `/…` sin espacios, la lista de comandos que coinciden. */
  const typed = input.trimStart();
  const commandHints = /^\/\S*$/.test(typed) ? COMMANDS.filter(c => c.name.startsWith(typed.toLowerCase())) : [];
  const busy = chat.isPending || summarize.isPending;

  const runCommand = (name: CommandName) => {
    setInput('');
    if (name === '/clear') {
      const last = messages[messages.length - 1];
      if (!last || !visible.length) { notify.info('El chat ya está limpio'); return; }
      chat.reset();
      writeCleared(clearedKey, last.createdAt);
      setClearedAt(last.createdAt);
      return;
    }
    if (name === '/resume') {
      if (!messages.length) { notify.info('No hay conversación que resumir'); return; }
      chat.reset();
      summarize.mutate(undefined, {
        onSuccess: res => notify.success('Memoria actualizada',
          res.summarized ? `${res.summarized} mensajes resumidos; el chat quedó limpio.` : 'Ya estaba todo resumido; el chat quedó limpio.'),
        onError: err => notify.error('No se pudo resumir', errorText(err)),
      });
    }
  };

  const send = (text: string) => {
    const question = text.trim();
    if (!question || busy || !ready) return;
    const command = COMMANDS.find(c => c.name === question.toLowerCase());
    if (command) { runCommand(command.name); return; }
    /* Se lee justo al enviar: es lo que se ve ahora en la terminal o el editor. */
    const context = activeSources
      .map(s => ({ type: s.type, title: s.title, content: s.read().slice(-MAX_SOURCE_CHARS), database: s.database?.() ?? undefined }))
      .filter(c => c.content.trim());
    setInput('');
    chat.mutate({ message: question, context });
  };

  /* El formulario va por debajo del panel (z-50 frente a z-60): se cierra el panel para verlo entero. */
  const review = (action: AssistantAction) => {
    setOpen(false);
    setReviewing(action);
  };

  const toggleSource = (id: string) => setExcluded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /* top-[58px]: 20 px bajo la barra de título propia (38 px, TitleBar). */
  const panel = open && (
    <aside aria-label="Asistente IA"
      className="fixed top-[58px] right-5 bottom-5 z-[60] w-[440px] max-w-[calc(100vw-40px)] glass glass-float elev-modal rounded-2xl flex flex-col overflow-hidden animate-slideUp">
      {/* Cabecera */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line shrink-0">
        <span className="w-9 h-9 rounded-xl grad-brand flex items-center justify-center elev-brand-sm text-white shrink-0">
          <SparkIcon />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Asistente IA</div>
          <div className="text-[11px] text-white/45 truncate">
            {provider ? <>{provider.vendor} · <span className="font-mono">{config?.model}</span></> : 'Sin conectar'}
          </div>
        </div>
        {messages.length > 0 && (confirmClear ? (
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => setConfirmClear(false)}
              className="mo-tab h-8 px-2.5 rounded-lg text-[11px] text-white/60 hover:text-white hover:bg-tint-hover">
              Cancelar
            </button>
            <button type="button" disabled={clear.isPending}
              onClick={() => clear.mutate(undefined, { onSettled: () => { setConfirmClear(false); chat.reset(); } })}
              className="mo-tab h-8 px-2.5 rounded-lg text-[11px] font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 disabled:opacity-50">
              Borrar memoria
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)}
            title="Borrar la conversación y lo que recuerda el asistente"
            className="mo-tab w-8 h-8 rounded-lg text-white/55 hover:text-white hover:bg-tint-hover flex items-center justify-center">
            <TrashIcon />
          </button>
        ))}
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente"
          className="mo-tab w-8 h-8 rounded-lg text-white/55 hover:text-white hover:bg-tint-hover flex items-center justify-center">
          <CloseIcon />
        </button>
      </div>

      {/* Conversación */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin scroll-layer px-4 py-4 space-y-4">
        {!isLoading && !ready && (
          <div className="glass-soft rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium">{config ? 'El asistente está desactivado' : 'Conecta un asistente de IA'}</p>
            <p className="text-xs text-white/55 leading-relaxed">
              Usa tu propia clave de Anthropic, OpenAI o Google Gemini. Cada cuenta tiene su propio asistente.
            </p>
            <button type="button" onClick={() => { setOpen(false); navigate(`${ROUTES.SETTINGS}?tab=assistant`); }}
              className="mo-tab inline-flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-xs font-semibold elev-brand-sm">
              Ir a Configuración
            </button>
          </div>
        )}

        {ready && visible.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-white/70 leading-relaxed">
              Pregunta sobre tus servidores, bases de datos, la terminal o una consulta. Te propongo comandos y SQL para que los pegues y decidas si ejecutarlos, y puedo preparar el alta de un servidor o de una conexión a base de datos.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="w-full text-left glass-soft row-hit rounded-xl px-3 py-2 text-xs text-white/75">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {visible.map(m => <Bubble key={m.id} message={m} targets={targets} onReview={review} />)}

        {busy && (
          <div className="flex items-center gap-2.5 text-xs text-white/45">
            <span className="w-7 h-7 rounded-lg grad-brand-soft border border-hairline flex items-center justify-center">
              <SparkIcon className="w-3.5 h-3.5 animate-pulse" />
            </span>
            {summarize.isPending ? 'Resumiendo la conversación en la memoria…' : 'Pensando…'}
          </div>
        )}

        {chat.isError && (
          <div className="glass-soft rounded-xl p-3 border border-rose-400/20 text-xs text-rose-300">
            {errorText(chat.error)}
          </div>
        )}
      </div>

      {/* Contexto adjunto + entrada */}
      <div className="border-t border-line p-3 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-white/35 font-semibold mr-1">Puede leer</span>
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-tint-active text-white/60 ring-1 ring-hairline inline-flex items-center gap-1"
            title="Servidores, métricas, conexiones, auditorías y notificaciones de tu cuenta">
            <EyeIcon /> Datos de tu cuenta
          </span>
          {sources.map(s => {
            const on = !excluded.has(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggleSource(s.id)} aria-pressed={on}
                title={on ? 'Se adjunta a la pregunta (clic para quitar)' : 'No se adjunta (clic para incluir)'}
                className={`mo-tab text-[11px] px-2 py-0.5 rounded-md ring-1 inline-flex items-center gap-1
                  ${on ? 'grad-brand-soft text-white/85 ring-hairline' : 'text-white/35 ring-hairline line-through'}`}>
                <EyeIcon /> {s.title}
              </button>
            );
          })}
        </div>
        {commandHints.length > 0 && (
          <div role="listbox" aria-label="Comandos" className="glass-soft rounded-xl p-1">
            {commandHints.map(c => (
              <button key={c.name} type="button" role="option" aria-selected={false}
                onClick={() => { setInput(c.name); inputRef.current?.focus(); }}
                className="w-full text-left row-hit rounded-lg px-2.5 py-1.5 flex items-baseline gap-2">
                <span className="font-mono text-xs text-white/90">{c.name}</span>
                <span className="text-[11px] text-white/45 truncate">{c.hint}</span>
              </button>
            ))}
          </div>
        )}
        <div className="glass-input rounded-xl flex items-end gap-2 px-3 py-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            disabled={!ready}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              /* Tab completa el comando que se está escribiendo. */
              if (e.key === 'Tab' && commandHints.length === 1 && typed !== commandHints[0].name) {
                e.preventDefault();
                setInput(commandHints[0].name);
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder={ready ? 'Escribe tu pregunta… (Shift+Enter, nueva línea · /clear · /resume)' : 'Conecta un asistente en Configuración'}
            className="flex-1 min-w-0 resize-none bg-transparent outline-none text-sm text-white/90 placeholder:text-white/30 max-h-40 scroll-thin disabled:opacity-50"
          />
          <button type="button" onClick={() => send(input)} disabled={!ready || !input.trim() || busy}
            aria-label="Enviar"
            className="mo-tab w-9 h-9 rounded-lg grad-brand text-white flex items-center justify-center elev-brand-sm disabled:opacity-40 shrink-0">
            <SendIcon />
          </button>
        </div>
        <p className="text-[10px] text-white/35 flex items-center gap-1">
          <LockIcon /> No ejecuta comandos ni consultas y no ve llaves SSH ni contraseñas. Las altas que proponga las confirmas tú.
        </p>
      </div>
    </aside>
  );

  return (
    <>
      {panel && createPortal(panel, document.body)}
      {reviewing?.kind === 'server' && (
        <AddServerModal isOpen initial={reviewing.data} onClose={() => setReviewing(null)} />
      )}
      {reviewing?.kind === 'database' && (
        <ConnectionModal initial={reviewing.data} onClose={() => setReviewing(null)} />
      )}
    </>
  );
};

/** Botón que abre el asistente; lo usan la barra superior y la terminal. */
export const AssistantLauncher = ({ compact = false }: { compact?: boolean }) => {
  const { open, setOpen } = useAssistant();
  return (
    <button type="button" onClick={() => setOpen(!open)} aria-pressed={open}
      title="Asistente IA"
      className={`mo-tab inline-flex items-center gap-1.5 rounded-xl text-xs font-medium border
        ${compact ? 'h-9 px-3' : 'h-7 px-2.5'}
        ${open ? 'mo-tab-on grad-brand-soft text-white border-hairline' : 'glass-soft row-hit text-white/70 hover:text-white'}`}>
      <SparkIcon className="w-3.5 h-3.5" />
      Asistente
    </button>
  );
};
