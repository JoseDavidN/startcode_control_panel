import React, { useEffect, useRef, useState } from 'react';
import { DbIcon } from '@components/databases/icons';
import { Modal } from '@components/common/Modal';
import { messageOf, smallBtn } from '@components/databases/redis/redisStyles';
import { useRedisCommand } from '@hooks/useRedis';
import { useAssistantSource, useAssistantTarget } from '@hooks/useAssistantBridge';
import { isSessionClosedError } from '@hooks/useDatabases';
import { formatReply } from '@utils/redis';
import { toSingleLine } from '@utils/commands';
import type { ApiError } from '@typings/api.types';

interface Entry {
  id: number;
  db: number;
  command: string;
  output: string;
  error: boolean;
  meta?: string;
}

interface Props {
  connectionId: string;
  connectionName: string;
  sessionId: string | null;
  db: number;
  onSessionClosed: () => void;
  onAudit: () => void;
}

/** Entradas que se conservan en pantalla (y lee el asistente las últimas). */
const MAX_ENTRIES = 200;
const ASSISTANT_ENTRIES = 30;
const MAX_HISTORY = 100;

/**
 * Consola de comandos como redis-cli, sobre la base elegida en la vista.
 * ↑/↓ recorren el historial. Lo peligroso pide confirmación y queda auditado;
 * lo que bloquearía la conexión compartida lo rechaza el backend.
 */
export const RedisConsole: React.FC<Props> = ({ connectionId, connectionName, sessionId, db, onSessionClosed, onAudit }) => {
  const command = useRedisCommand(connectionId, sessionId);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [pending, setPending] = useState<{ command: string; db: number; message: string; hint?: string } | null>(null);
  const seq = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [entries]);

  const push = (entry: Omit<Entry, 'id'>) =>
    setEntries(prev => [...prev, { ...entry, id: ++seq.current }].slice(-MAX_ENTRIES));

  const execute = async (line: string, onDb: number, confirm = false) => {
    try {
      const res = await command.mutateAsync({ db: onDb, command: line, confirm });
      push({
        db: onDb, command: line, error: false, output: formatReply(res.reply),
        meta: `${res.durationMs} ms${res.truncated ? ' · respuesta recortada' : ''}`,
      });
    } catch (err) {
      if (isSessionClosedError(err)) onSessionClosed();
      const e = err as Partial<ApiError>;
      if (e?.code === 'DANGEROUS_QUERY') {
        setPending({ command: line, db: onDb, message: e.message ?? 'Comando peligroso', hint: e.hint });
        return;
      }
      push({ db: onDb, command: line, error: true, output: `(error) ${messageOf(err)}` });
    }
  };

  const submit = () => {
    const line = input.trim();
    if (!line || command.isPending) return;
    setHistory(prev => [...prev.filter(h => h !== line), line].slice(-MAX_HISTORY));
    setCursor(null);
    setInput('');
    if (/^(clear|cls)$/i.test(line)) { setEntries([]); return; }
    void execute(line, db);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault();
      const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setInput(history[next]);
    }
    if (e.key === 'ArrowDown' && cursor !== null) {
      e.preventDefault();
      const next = cursor + 1;
      if (next >= history.length) { setCursor(null); setInput(''); } else { setCursor(next); setInput(history[next]); }
    }
    if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setEntries([]); }
  };

  /* El asistente lee las últimas respuestas y puede dejar un comando escrito, nunca ejecutarlo. */
  const assistantOn = Boolean(sessionId);
  useAssistantSource(`redis-console:${connectionId}`, 'command_output', `Consola Redis · ${connectionName}`,
    () => entries.slice(-ASSISTANT_ENTRIES).map(en => `db${en.db}> ${en.command}\n${en.output}`).join('\n\n'), assistantOn);
  useAssistantTarget(`redis-console:${connectionId}`, 'command', 'la consola de Redis', text => {
    const line = toSingleLine(text);
    if (!line) return;
    setInput(line);
    inputRef.current?.focus();
  }, assistantOn);

  return (
    <>
      <div className="flex items-center gap-2 px-4 h-11 border-b border-line shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Consola</h3>
        <span className="text-[11px] text-white/30 hidden lg:inline">↑ ↓ historial · Ctrl + L limpia · los comandos peligrosos piden confirmación</span>
        <span className="flex-1" />
        <button type="button" className={smallBtn} onClick={onAudit} title="Comandos peligrosos confirmados y claves borradas en esta conexión">
          <DbIcon name="shield" className="w-3.5 h-3.5" />Auditoría
        </button>
        <button type="button" className={smallBtn} onClick={() => setEntries([])} disabled={!entries.length}>Limpiar</button>
      </div>

      <div ref={logRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin px-4 py-3 font-mono text-xs space-y-3"
        onClick={() => { if (!window.getSelection()?.toString()) inputRef.current?.focus(); }}>
        {!entries.length && (
          <p className="text-white/30">
            Escribe un comando de Redis, por ejemplo <span className="text-white/55">INFO memory</span>, <span className="text-white/55">HGETALL user:1</span> o <span className="text-white/55">SCAN 0 MATCH sesion:* COUNT 100</span>.
          </p>
        )}
        {entries.map(en => (
          <div key={en.id}>
            <div className="text-violet-300/90 break-all"><span className="text-white/35">db{en.db}&gt; </span>{en.command}</div>
            <pre className={`whitespace-pre-wrap break-all mt-1 ${en.error ? 'text-rose-300' : 'text-white/80'}`}>{en.output}</pre>
            {en.meta && <div className="text-[10px] text-white/30 mt-0.5">{en.meta}</div>}
          </div>
        ))}
      </div>

      <div className="px-4 py-2.5 border-t border-line shrink-0">
        <div className="glass-input rounded-lg h-9 flex items-center gap-2 px-3">
          <span className="text-xs font-mono text-white/35 shrink-0">db{db}&gt;</span>
          <input ref={inputRef} value={input} onChange={e => { setInput(e.target.value); setCursor(null); }} onKeyDown={onKeyDown}
            spellCheck={false} autoComplete="off" disabled={!sessionId} aria-label="Comando de Redis"
            placeholder={sessionId ? 'GET clave' : 'Conectando…'}
            className="flex-1 min-w-0 bg-transparent outline-none text-xs font-mono placeholder:text-white/25 text-white/90" />
          {command.isPending && <span className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin shrink-0" />}
        </div>
      </div>

      <Modal isOpen={pending !== null} onClose={() => setPending(null)} title="Confirmar comando peligroso" size="sm">
        {pending && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-rose-300 shrink-0 mt-0.5"><DbIcon name="warn" className="w-5 h-5" /></span>
              <div>
                <p className="text-sm font-semibold text-white">{pending.message}</p>
                {pending.hint && <p className="text-xs text-white/55 mt-1">{pending.hint}</p>}
              </div>
            </div>
            <pre className="p-3 rounded-lg bg-tint-sunken border border-hairline-soft text-xs font-mono text-white/80 whitespace-pre-wrap break-all max-h-48 overflow-y-auto scroll-thin">{pending.command}</pre>
            <p className="text-xs text-white/45">Base: <span className="font-mono text-white/70">db{pending.db}</span></p>
            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button type="button" onClick={() => setPending(null)}
                className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">Cancelar</button>
              <button type="button"
                onClick={() => { const p = pending; setPending(null); void execute(p.command, p.db, true); }}
                className="h-10 px-4 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-sm font-semibold">
                Ejecutar igualmente
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
