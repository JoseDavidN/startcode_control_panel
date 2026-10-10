import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useCommandHistory, useExecCommand } from '@hooks/useServerCommands';
import type { CommandResult } from '@services/command.service';
import { notify } from '@services/notification.service';
import { STATUS_TONE, fmtMs, statusLabel, toSingleLine } from '@utils/commands';
import { useAssistantSource, useAssistantTarget } from '@hooks/useAssistantBridge';

const sp = { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.75, strokeLinecap:'round' as const, strokeLinejoin:'round' as const };

const LoaderIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={`${className} animate-spin`}><path d="M12 3a9 9 0 109 9" /></svg>;
const ShieldIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={className}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /></svg>;
const WarnIcon   = ({ className = 'w-5 h-5' }) => <svg {...sp} className={className}><path d="M12 4L2 20h20L12 4z" /><path d="M12 10v5M12 18v.01" /></svg>;
const CloseIcon  = ({ className = 'w-4 h-4' }) => <svg {...sp} className={className}><path d="M6 6l12 12M18 6L6 18" /></svg>;
const OutputIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={className}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></svg>;

interface Props {
  serverId: string;
  serverName: string;
}

/** Lo que el detalle del servidor puede pedirle a la barra desde fuera. */
export interface CommandBarHandle {
  /** Carga un comando en la línea (p. ej. desde el historial) y le da el foco. */
  load: (command: string) => void;
}

/** Igual que el backend: `sudo ` escrito a mano (sin opciones) cuenta como sudo y no se duplica. */
const LEADING_SUDO = /^\s*sudo\s+(?!-)/;

/** Comando tal como se reejecutaría: con `sudo ` delante si fue con sudo. */
const withSudo = (command: string, sudo: boolean) => (sudo ? `sudo ${command}` : command);

/** Ruta como la escribe un prompt de bash: el home y lo que cuelga de él, con `~`. */
const prettyPath = (path: string, home: string | null) => {
  if (!home || home === '/') return path;
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
};

interface ApiErrorLike { code?: string; message?: string; hint?: string }

/** Un comando pendiente de confirmar o de contraseña de sudo. */
interface Pending { command: string; kind: 'danger' | 'sudo' | 'blocked'; message?: string; hint?: string }

/**
 * Línea de comandos flotante del detalle de un servidor: queda pegada al
 * borde inferior mientras se recorre cualquier tab y la salida se abre
 * encima. Cada comando va por SSH en su propia conexión, sin TTY y con 60 s
 * como máximo, siempre en el home del usuario SSH. Es para comandos
 * puntuales, no una terminal: el backend rechaza moverse de directorio, ver
 * la ruta, inspeccionar discos o abrir un shell (`BLOCKED_COMMAND`).
 * Todo intento que llega al servidor queda en la auditoría.
 */
export const CommandBar = forwardRef<CommandBarHandle, Props>(({ serverId, serverName }, ref) => {
  const exec = useExecCommand(serverId);
  const { data: audit = [] } = useCommandHistory(serverId);

  const [input, setInput] = useState('');
  /* Todo corre en el home del usuario SSH; la ruta real la trae el primer comando. */
  const [home, setHome] = useState<string | null>(null);
  const [useSudo, setUseSudo] = useState(false);
  const [entries, setEntries] = useState<CommandResult[]>([]);
  const [outputOpen, setOutputOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sudoDraft, setSudoDraft] = useState('');
  /* Contraseña validada: solo en memoria mientras el detalle esté abierto. */
  const [sudoPassword, setSudoPassword] = useState<string | undefined>();

  /* ↑/↓ recorren lo ejecutado en esta sesión y luego la auditoría. */
  const [recallIndex, setRecallIndex] = useState(-1);
  const [draft, setDraft] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  /* El asistente lee los últimos resultados y puede dejar un comando en la
     línea; nunca lo ejecuta (eso solo pasa con Enter o el botón). */
  useAssistantSource(`commands:${serverId}`, 'command_output', `Línea de comandos · ${serverName}`, () =>
    entries.slice(-10).map(e =>
      `${e.sudo ? '#' : '$'} ${withSudo(e.command, e.sudo)}\n${e.output ?? ''}\n[${statusLabel(e.status, e.exitCode)} · ${fmtMs(e.durationMs)}${e.truncated ? ' · salida recortada' : ''}]`,
    ).join('\n\n'),
  );
  useAssistantTarget(`commands:${serverId}`, 'command', 'la línea de comandos', text => {
    const line = toSingleLine(text);
    if (!line) return;
    setInput(line);
    setPending(null);
    setRecallIndex(-1);
    inputRef.current?.focus();
  });

  useImperativeHandle(ref, () => ({
    load: command => {
      setInput(command);
      setPending(null);
      setRecallIndex(-1);
      inputRef.current?.focus();
    },
  }), []);

  const recall = useMemo(() => {
    const seen = new Set<string>();
    return [...entries.map(e => withSudo(e.command, e.sudo)).reverse(), ...audit.map(a => withSudo(a.command, a.sudo))]
      .filter(c => (seen.has(c) ? false : (seen.add(c), true)));
  }, [entries, audit]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [entries, outputOpen]);

  const run = async (command: string, opts: { confirm?: boolean; password?: string } = {}) => {
    const trimmed = command.trim();
    if (!trimmed || exec.isPending) return;

    /* Con el botón marcado o con `sudo ` escrito: el backend quita el prefijo,
       así que nunca llega duplicado. */
    const sudo = useSudo || LEADING_SUDO.test(trimmed);
    const password = opts.password ?? sudoPassword;
    try {
      const result = await exec.mutateAsync({
        command: trimmed,
        sudo,
        sudoPassword: sudo ? password : undefined,
        confirm: opts.confirm,
      });

      if (sudo && opts.password) setSudoPassword(opts.password);
      setEntries(prev => [...prev, result]);
      setOutputOpen(true);
      if (result.home) setHome(result.home);
      setPending(null);
      setSudoDraft('');
      setInput('');
      setRecallIndex(-1);
    } catch (err: unknown) {
      const error = (err ?? {}) as ApiErrorLike;

      if (error.code === 'BLOCKED_COMMAND') {
        setPending({ command: trimmed, kind: 'blocked', message: error.message, hint: error.hint });
        return;
      }
      if (error.code === 'DANGEROUS_COMMAND') {
        setPending({ command: trimmed, kind: 'danger', message: error.message });
        return;
      }
      if (error.code === 'SUDO_REQUIRED' || error.code === 'SUDO_PASSWORD') {
        setSudoPassword(undefined);
        setPending({
          command: trimmed,
          kind: 'sudo',
          message: error.code === 'SUDO_PASSWORD' ? error.message : (error.hint ?? error.message),
        });
        return;
      }

      setPending(null);
      notify.error('No se pudo ejecutar el comando', error.message ?? 'Error de conexión con el servidor');
    } finally {
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void run(input);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (pending) setPending(null);
      else setOutputOpen(false);
      return;
    }
    if (e.key === 'ArrowUp' && recall.length) {
      e.preventDefault();
      const next = Math.min(recallIndex + 1, recall.length - 1);
      if (recallIndex === -1) setDraft(input);
      setRecallIndex(next);
      setInput(recall[next]);
      return;
    }
    if (e.key === 'ArrowDown' && recallIndex >= 0) {
      e.preventDefault();
      const next = recallIndex - 1;
      setRecallIndex(next);
      setInput(next === -1 ? draft : recall[next]);
      return;
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setEntries([]);
      setOutputOpen(false);
    }
  };

  const showOutput = outputOpen && entries.length > 0;
  const typedSudo = LEADING_SUDO.test(input);
  const asRoot = useSudo || typedSudo;

  return (
    <div className="sticky bottom-0 z-20 space-y-2">

      {/* Comando no permitido: se queda en la línea para corregirlo */}
      {pending?.kind === 'blocked' && (
        <div className="mo-panel glass glass-float elev-float rounded-2xl p-4 flex items-start gap-3 border-amber-400/25">
          <WarnIcon className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{pending.message ?? 'Comando no permitido'}</p>
            {pending.hint && <p className="text-xs text-white/55 mt-1">{pending.hint}</p>}
          </div>
          <button
            onClick={() => { setPending(null); inputRef.current?.focus(); }}
            title="Cerrar (Esc)"
            className="mo-tab w-7 h-7 rounded-lg text-white/60 hover:text-white hover:bg-tint-hover flex items-center justify-center shrink-0"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Confirmación o sudo pendiente: encima de la barra, antes que la salida */}
      {pending?.kind === 'danger' && (
        <div className="mo-panel glass glass-float elev-float rounded-2xl p-4 flex items-start gap-3 border-rose-400/25">
          <WarnIcon className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{pending.message ?? 'Comando peligroso'}</p>
            <p className="text-xs font-mono text-white/55 mt-1 break-all">{pending.command}</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setPending(null)}
                disabled={exec.isPending}
                className="mo-tab h-9 px-4 rounded-xl glass-soft row-hit text-white/85 text-xs font-medium disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={() => void run(pending.command, { confirm: true })}
                disabled={exec.isPending}
                className="mo-tab h-9 px-4 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-40"
              >
                {exec.isPending ? 'Ejecutando…' : 'Ejecutar igualmente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pending?.kind === 'sudo' && (
        <div className="mo-panel glass glass-float elev-float rounded-2xl p-4">
          <p className="text-sm font-semibold text-white mb-1">Hace falta sudo</p>
          <p className="text-xs text-white/60 leading-relaxed mb-3">
            {pending.message ?? 'El usuario SSH no es root y sudo pide contraseña.'}
          </p>
          <div className="flex gap-2">
            <div className="glass-input rounded-xl h-10 flex items-center px-3.5 flex-1">
              <input
                autoFocus
                type="password"
                autoComplete="off"
                value={sudoDraft}
                onChange={e => setSudoDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && sudoDraft) void run(pending.command, { password: sudoDraft });
                  if (e.key === 'Escape') setPending(null);
                }}
                placeholder="Contraseña del usuario SSH"
                className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25"
              />
            </div>
            <button
              onClick={() => setPending(null)}
              className="mo-tab h-10 px-4 rounded-xl glass-soft row-hit text-white/85 text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={() => void run(pending.command, { password: sudoDraft })}
              disabled={!sudoDraft || exec.isPending}
              className="mo-tab h-10 px-4 rounded-xl grad-brand elev-brand-sm text-white text-xs font-semibold disabled:opacity-40"
            >
              {exec.isPending ? 'Ejecutando…' : 'Ejecutar'}
            </button>
          </div>
          <p className="text-[11px] text-white/40 mt-1.5">Se usa mientras el detalle esté abierto y no se guarda.</p>
        </div>
      )}

      {/* Salida de la sesión */}
      {showOutput && !pending && (
        <div className="mo-panel glass glass-float elev-float rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-line">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Salida</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setEntries([]); setOutputOpen(false); }}
                title="Limpiar la salida (Ctrl+L)"
                className="mo-tab h-7 px-2.5 rounded-lg text-white/60 hover:text-white hover:bg-tint-hover text-xs font-medium"
              >
                Limpiar
              </button>
              <button
                onClick={() => setOutputOpen(false)}
                title="Ocultar la salida (Esc)"
                className="mo-tab w-7 h-7 rounded-lg text-white/60 hover:text-white hover:bg-tint-hover flex items-center justify-center"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div
            ref={outputRef}
            className="p-4 font-mono text-xs leading-relaxed max-h-[45vh] overflow-y-auto scroll-thin"
          >
            {entries.map(entry => (
              <div key={entry.id || `${entry.command}-${entry.durationMs}`} className="mb-4 last:mb-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-violet-300">{serverName}</span>
                  <span className="text-white/40">{prettyPath(entry.cwd, entry.home)}</span>
                  <span className={entry.sudo ? 'text-amber-300' : 'text-white/55'}>{entry.sudo ? '#' : '$'}</span>
                  <span className="text-white/90 break-all">
                    {entry.sudo && <span className="text-amber-300 mr-1.5">sudo</span>}
                    {entry.command}
                  </span>
                </div>
                {entry.output && (
                  <pre className="text-white/70 whitespace-pre-wrap break-all mt-1">{entry.output}</pre>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                  <span className={`font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 ${STATUS_TONE[entry.status]}`}>
                    {statusLabel(entry.status, entry.exitCode)}
                  </span>
                  <span className="text-white/35">{fmtMs(entry.durationMs)}</span>
                  {entry.truncated && <span className="text-amber-300/80">salida recortada a 1 MB</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra */}
      <div className="glass glass-float elev-float rounded-2xl p-2 flex items-center gap-2">
        <div className="glass-input rounded-xl h-11 flex-1 min-w-0 flex items-center px-3.5 gap-2 font-mono text-sm">
          <span className="text-white/40 shrink-0" title={home ?? 'Home del usuario SSH'}>~</span>
          <span className={asRoot ? 'text-amber-300' : 'text-violet-300'}>{asRoot ? '#' : '$'}</span>
          {useSudo && !typedSudo && <span className="text-amber-300 shrink-0">sudo</span>}
          <input
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              setRecallIndex(-1);
              if (pending?.kind === 'blocked') setPending(null);
            }}
            onKeyDown={onKeyDown}
            disabled={exec.isPending}
            spellCheck={false}
            autoComplete="off"
            placeholder={exec.isPending ? 'Ejecutando…' : 'Ejecutar un comando en el servidor… (↑/↓ historial)'}
            className="flex-1 min-w-0 bg-transparent outline-none text-white/90 placeholder:text-white/25 disabled:opacity-60"
          />
          {exec.isPending && <LoaderIcon className="w-4 h-4 text-white/55 shrink-0" />}
        </div>

        {entries.length > 0 && (
          <button
            onClick={() => setOutputOpen(v => !v)}
            title={outputOpen ? 'Ocultar la salida' : 'Mostrar la salida'}
            className={`mo-tab w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border
              ${outputOpen
                ? 'grad-brand-soft text-white border-hairline'
                : 'glass-soft row-hit text-white/60 hover:text-white'}`}
          >
            <OutputIcon />
          </button>
        )}

        <button
          onClick={() => { setUseSudo(v => !v); inputRef.current?.focus(); }}
          title="Ejecutar los comandos con sudo"
          aria-pressed={useSudo}
          className={`mo-tab flex items-center gap-2 h-11 px-3.5 rounded-xl text-xs font-medium border shrink-0
            ${useSudo
              ? 'mo-tab-on grad-brand-soft text-white border-hairline'
              : 'glass-soft text-white/60 hover:text-white hover:border-hairline-hover'}`}
        >
          <ShieldIcon className="w-3.5 h-3.5" /> sudo
        </button>
      </div>
    </div>
  );
});

CommandBar.displayName = 'CommandBar';
