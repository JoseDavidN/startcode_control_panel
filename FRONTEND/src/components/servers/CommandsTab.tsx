import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCommandHistory, useExecCommand } from '@hooks/useServerCommands';
import type { CommandResult, CommandStatus } from '@services/command.service';
import { notify } from '@services/notification.service';
import { fullDateTime, timeAgo } from '@utils/time';

const sp = { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.75, strokeLinecap:'round' as const, strokeLinejoin:'round' as const };

const LoaderIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={`${className} animate-spin`}><path d="M12 3a9 9 0 109 9" /></svg>;
const ShieldIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={className}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /></svg>;
const WarnIcon   = ({ className = 'w-5 h-5' }) => <svg {...sp} className={className}><path d="M12 4L2 20h20L12 4z" /><path d="M12 10v5M12 18v.01" /></svg>;

interface Props {
  serverId: string;
  serverName: string;
}

interface ApiErrorLike { code?: string; message?: string; hint?: string }

/** Un comando pendiente de confirmar o de contraseña de sudo. */
interface Pending { command: string; kind: 'danger' | 'sudo'; message?: string }

const STATUS_TONE: Record<CommandStatus, string> = {
  ok: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20',
  error: 'bg-rose-500/15 text-rose-300 ring-rose-400/20',
  timeout: 'bg-amber-500/15 text-amber-300 ring-amber-400/20',
  failed: 'bg-rose-500/15 text-rose-300 ring-rose-400/20',
};

const statusLabel = (status: CommandStatus, exitCode: number | null) =>
  status === 'timeout' ? 'tiempo agotado'
    : status === 'failed' ? 'no ejecutado'
      : `exit ${exitCode ?? '?'}`;

const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

/**
 * Línea de comandos sin abrir la terminal: cada comando va por SSH en su
 * propia conexión, sin TTY y con 60 s como máximo. El directorio de trabajo
 * se arrastra entre comandos, así que `cd` funciona como en una consola.
 * Todo intento queda en la auditoría del servidor.
 */
export const CommandsTab: React.FC<Props> = ({ serverId, serverName }) => {
  const exec = useExecCommand(serverId);
  const { data: audit = [], isLoading: auditLoading } = useCommandHistory(serverId);

  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState('~');
  const [useSudo, setUseSudo] = useState(false);
  const [entries, setEntries] = useState<CommandResult[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sudoDraft, setSudoDraft] = useState('');
  /* Contraseña validada: solo en memoria mientras el detalle esté abierto. */
  const [sudoPassword, setSudoPassword] = useState<string | undefined>();

  /* ↑/↓ recorren lo ejecutado en esta sesión y luego la auditoría. */
  const [recallIndex, setRecallIndex] = useState(-1);
  const [draft, setDraft] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const recall = useMemo(() => {
    const seen = new Set<string>();
    return [...entries.map(e => e.command).reverse(), ...audit.map(a => a.command)]
      .filter(c => (seen.has(c) ? false : (seen.add(c), true)));
  }, [entries, audit]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [entries]);

  const run = async (command: string, opts: { confirm?: boolean; password?: string } = {}) => {
    const trimmed = command.trim();
    if (!trimmed || exec.isPending) return;

    const password = opts.password ?? sudoPassword;
    try {
      const result = await exec.mutateAsync({
        command: trimmed,
        cwd,
        sudo: useSudo,
        sudoPassword: useSudo ? password : undefined,
        confirm: opts.confirm,
      });

      if (useSudo && opts.password) setSudoPassword(opts.password);
      setEntries(prev => [...prev, result]);
      setCwd(result.nextCwd || cwd);
      setPending(null);
      setInput('');
      setRecallIndex(-1);
    } catch (err: unknown) {
      const error = (err ?? {}) as ApiErrorLike;

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
    }
  };

  const reuse = (command: string, from?: string | null) => {
    setInput(command);
    if (from) setCwd(from);
    setRecallIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div className="mo-panel space-y-5">
      <div className="glass rounded-2xl grain p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-white">Línea de comandos</h2>
            <p className="text-xs text-white/45 mt-0.5">
              Sin TTY · máximo 60 s y 1 MB de salida · cada comando queda auditado
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseSudo(v => !v)}
              title="Ejecutar los comandos con sudo"
              className={`mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl text-xs font-medium border
                ${useSudo
                  ? 'mo-tab-on grad-brand-soft text-white border-hairline'
                  : 'glass-soft text-white/60 hover:text-white hover:border-hairline-hover'}`}
            >
              <ShieldIcon className="w-3.5 h-3.5" /> sudo
            </button>
            <button
              onClick={() => setEntries([])}
              disabled={!entries.length}
              title="Limpiar la salida (Ctrl+L)"
              className="mo-tab h-9 px-3.5 rounded-xl glass-soft row-hit text-white/70 hover:text-white text-xs font-medium disabled:opacity-40"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Salida */}
        <div
          ref={outputRef}
          className="glass-soft rounded-xl p-4 font-mono text-xs leading-relaxed max-h-[50vh] min-h-[160px] overflow-y-auto scroll-thin"
          onClick={() => inputRef.current?.focus()}
        >
          {entries.length === 0 ? (
            <p className="text-white/35">
              Escribe un comando y pulsa Enter. ↑/↓ recorren el historial; Ctrl+L limpia la salida.
            </p>
          ) : (
            entries.map(entry => (
              <div key={entry.id || `${entry.command}-${entry.durationMs}`} className="mb-4 last:mb-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-violet-300">{serverName}</span>
                  <span className="text-white/40">{entry.cwd}</span>
                  <span className="text-white/55">{entry.sudo ? '#' : '$'}</span>
                  <span className="text-white/90 break-all">{entry.command}</span>
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
            ))
          )}
        </div>

        {/* Confirmación o sudo pendiente */}
        {pending?.kind === 'danger' && (
          <div className="glass-soft rounded-xl p-4 mt-3 flex items-start gap-3 border border-rose-400/25">
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
          <div className="glass-soft rounded-xl p-4 mt-3">
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

        {/* Entrada */}
        <div className="glass-input rounded-xl h-11 flex items-center px-3.5 gap-2 mt-3 font-mono text-sm">
          <span className="text-white/40 shrink-0 max-w-[40%] truncate" title={cwd}>{cwd}</span>
          <span className={useSudo ? 'text-amber-300' : 'text-violet-300'}>{useSudo ? '#' : '$'}</span>
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={e => { setInput(e.target.value); setRecallIndex(-1); }}
            onKeyDown={onKeyDown}
            disabled={exec.isPending}
            spellCheck={false}
            autoComplete="off"
            placeholder={exec.isPending ? 'Ejecutando…' : 'df -h, systemctl status nginx, docker ps…'}
            className="flex-1 min-w-0 bg-transparent outline-none text-white/90 placeholder:text-white/25 disabled:opacity-60"
          />
          {exec.isPending && <LoaderIcon className="w-4 h-4 text-white/55 shrink-0" />}
        </div>
      </div>

      {/* Auditoría */}
      <div className="glass rounded-2xl grain p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white/85">Auditoría</h3>
            <p className="text-xs text-white/45 mt-0.5">Últimos 50 comandos en este servidor, de cualquier usuario</p>
          </div>
        </div>

        {auditLoading ? (
          <div className="edge-dashed rounded-xl py-8 text-center text-sm text-white/45">Cargando…</div>
        ) : audit.length === 0 ? (
          <div className="edge-dashed rounded-xl py-8 text-center text-sm text-white/45">
            Todavía no se ha ejecutado ningún comando desde el panel.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto scroll-thin">
            {audit.map(row => (
              <button
                key={row.id}
                onClick={() => reuse(row.command, row.cwd)}
                title="Cargar en la línea de comandos"
                className="w-full text-left glass-soft row-hit rounded-xl px-3 py-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 items-center"
              >
                <span className="text-xs font-mono text-white/85 truncate">
                  {row.sudo && <span className="text-amber-300 mr-1.5">sudo</span>}
                  {row.command}
                </span>
                <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 justify-self-end ${STATUS_TONE[row.status]}`}>
                  {statusLabel(row.status, row.exitCode)}
                </span>
                <span className="text-[11px] text-white/45 truncate">
                  {row.user.name || row.user.email} · <span className="font-mono">{row.cwd ?? '~'}</span>
                </span>
                <span className="text-[11px] text-white/40 justify-self-end" title={fullDateTime(row.createdAt)}>
                  {timeAgo(row.createdAt)} · {fmtMs(row.durationMs)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
