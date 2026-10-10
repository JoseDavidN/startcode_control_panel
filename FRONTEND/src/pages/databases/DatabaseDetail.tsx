import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '@components/common/Card';
import { EngineBadge } from '@components/databases/EngineIcon';
import { DbIcon } from '@components/databases/icons';
import { SchemaTree } from '@components/databases/SchemaTree';
import { SqlEditor } from '@components/databases/SqlEditor';
import { QueryResults } from '@components/databases/QueryResults';
import { QueryAuditModal } from '@components/databases/QueryAuditModal';
import { Modal } from '@components/common/Modal';
import {
  isSessionClosedError,
  useDatabaseSession,
  useDatabaseConnection,
  useDatabaseSchemas,
  useRunQuery,
} from '@hooks/useDatabases';
import { useAssistantSource, useAssistantTarget } from '@hooks/useAssistantBridge';
import { maskValue, sensitiveKind } from '@utils/sensitiveColumns';
import type { DatabaseSessionStatus } from '@hooks/useDatabases';
import { DATABASE_ENGINE_LABELS, MANAGEABLE_ENGINES } from '@typings/database.types';
import { ROUTES } from '@utils/constants';
import { engineDialect } from '@utils/sqlDialect';
import type { ApiError } from '@typings/api.types';
import type { QueryResult } from '@typings/database.types';

/** Mensaje del backend (los de validación llegan como lista). */
function errorMessage(err: unknown): string | null {
  if (!err) return null;
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  return msg || (err as Error)?.message || 'Error desconocido';
}

/** Estado de la conexión de esta vista (no de la conexión guardada). */
const SessionBadge = ({ status }: { status: DatabaseSessionStatus }) => {
  const base = 'text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1';
  if (status === 'open') return <span className={`${base} bg-emerald-500/15 text-emerald-300 ring-emerald-400/20`}>Conectada</span>;
  if (status === 'connecting' || status === 'idle') return <span className={`${base} bg-tint-active text-white/55 ring-hairline`}>Conectando…</span>;
  return <span className={`${base} bg-rose-500/15 text-rose-300 ring-rose-400/20`}>Sin conexión</span>;
};

/** Sentencia que el backend marcó como peligrosa y espera confirmación. */
interface PendingQuery {
  sql: string;
  schema: string | null;
  message: string;
  hint?: string;
}

/* `api.service` rechaza con un `ApiError` plano (`code`, `message`, `hint`),
   no con el error de axios: el código no está en `response.data`. */
function dangerousQuery(err: unknown): { message: string; hint?: string } | null {
  const e = err as Partial<ApiError> | undefined;
  return e?.code === 'DANGEROUS_QUERY' ? { message: e.message ?? 'Consulta peligrosa', hint: e.hint } : null;
}

/** Filas del resultado que lee el asistente. */
const ASSISTANT_ROWS = 100;

/** Resultado como texto tabulado para el asistente, con las columnas de secretos tapadas. */
function resultForAssistant(result: QueryResult | undefined, sql: string | undefined): string {
  if (!result) return '';
  const head = sql ? `Consulta: ${sql}\n` : '';
  if (!result.columns) {
    return `${head}Sin filas. Filas afectadas: ${result.affectedRows ?? 0} · ${result.durationMs} ms`;
  }
  /* Las contraseñas y tokens de las tablas no salen; los correos sí (son datos de consulta). */
  const secret = result.columns.map(c => sensitiveKind(c) === 'secret');
  const cell = (v: unknown, i: number) => {
    if (secret[i] && v !== null && v !== undefined) return maskValue('secret', v);
    if (v === null || v === undefined) return 'NULL';
    const text = typeof v === 'object' ? JSON.stringify(v) : String(v as string | number);
    return text.length > 300 ? `${text.slice(0, 300)}…` : text.replace(/[\t\n]/g, ' ');
  };
  const rows = result.rows.slice(0, ASSISTANT_ROWS).map(r => r.map(cell).join('\t'));
  const more = result.rowCount > rows.length ? `\n… ${result.rowCount - rows.length} filas más${result.truncated ? ' (el resultado venía recortado a 1000)' : ''}` : '';
  return `${head}${result.columns.join('\t')}\n${rows.join('\n')}${more}\n(${result.rowCount} filas · ${result.durationMs} ms)`;
}

/** `startcode-db_mercadeo-20261009-1745`: conexión, base y fecha local. */
function exportName(connection: string, schema: string | null): string {
  const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return [slug(connection), schema && slug(schema), stamp].filter(Boolean).join('-');
}

/* ── Gestión de una conexión ──────────────────────────────────────────
   Misma ventana que el resto: cabecera fija y el resto repartido en el alto
   del contenedor. Arriba, bases (30 %) y editor (70 %); abajo, a todo el
   ancho, los resultados. Cada zona desplaza su propio contenido. */
export const DatabaseDetail: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: conn, isLoading, isError } = useDatabaseConnection(id);
  const manageable = conn ? MANAGEABLE_ENGINES.includes(conn.engine) : false;
  /* La conexión a la base vive mientras esta vista está montada. */
  const session = useDatabaseSession(conn);
  const schemasQuery = useDatabaseSchemas(conn, session.sessionId);
  const runQuery = useRunQuery(id, session.sessionId);
  const { markClosed } = session;

  /* Si el backend dice que la sesión ya no existe, la cabecera ofrece reconectar. */
  useEffect(() => {
    if (isSessionClosedError(schemasQuery.error)) markClosed();
  }, [schemasQuery.error, markClosed]);

  const [sql, setSql] = useState('');
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingQuery | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  /* Con base fija en la conexión, el editor siempre corre sobre ella. */
  const activeSchema = conn?.database ?? selectedSchema;

  /* ── Asistente: lee el editor, el último resultado y la estructura, que el
     backend saca del motor al preguntar; puede dejar SQL en el editor, nunca ejecutarlo. */
  const sessionId = session.sessionId;
  const assistantOn = Boolean(conn && manageable);
  const connLabel = conn?.name ?? 'Base de datos';
  useAssistantSource(`sql-editor:${id}`, 'sql_editor', `Editor SQL · ${connLabel}`,
    () => (sql.trim() ? `Base activa: ${activeSchema ?? 'ninguna'}\n${sql}` : ''), assistantOn);
  useAssistantSource(`sql-result:${id}`, 'sql_result', `Resultado SQL · ${connLabel}`,
    () => resultForAssistant(runQuery.data, runQuery.variables?.sql), assistantOn);
  useAssistantSource(`sql-schema:${id}`, 'schema', `Estructura · ${connLabel}`, () => {
    if (!conn) return '';
    const lines = [
      `Motor: ${DATABASE_ENGINE_LABELS[conn.engine]}${conn.version ? ` v${conn.version}` : ''} · ${conn.host}:${conn.port} · usuario ${conn.username || '—'}`,
      `Bases: ${(schemasQuery.data ?? []).filter(s => !s.system).map(s => s.name).join(', ') || '—'}`,
      `Base activa: ${activeSchema ?? 'ninguna'}`,
    ];
    return lines.join('\n');
  }, assistantOn, () => (conn ? { connectionId: conn.id, sessionId: sessionId ?? undefined, schema: activeSchema ?? undefined } : null));
  useAssistantTarget(`sql-editor:${id}`, 'sql', 'el editor SQL', text => {
    /* Se añade debajo de lo que haya: no se pierde lo que el usuario escribía. */
    setSql(prev => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${text}` : text));
    editorRef.current?.focus();
  }, assistantOn);

  const run = () => {
    const el = editorRef.current;
    /* Con texto seleccionado se ejecuta solo la selección. */
    const selected = el && el.selectionEnd > el.selectionStart
      ? sql.slice(el.selectionStart, el.selectionEnd)
      : sql;
    const statement = selected.trim();
    if (!statement || runQuery.isPending) return;
    runQuery.mutate({ sql: statement, schema: activeSchema }, {
      onError: err => {
        if (isSessionClosedError(err)) { markClosed(); return; }
        /* No es un error de SQL: el backend pide confirmación y no ejecutó nada. */
        const danger = dangerousQuery(err);
        if (!danger) return;
        runQuery.reset();
        setPending({ sql: statement, schema: activeSchema, ...danger });
      },
    });
  };

  const confirmPending = () => {
    if (!pending) return;
    runQuery.mutate({ sql: pending.sql, schema: pending.schema, confirm: true });
    setPending(null);
  };

  /* Doble clic en el árbol: la sentencia del objeto, sobre su base. */
  /* Estable: el árbol va con `memo` y no debe re-renderizarse con cada tecla. */
  const pickFromTree = useCallback((schema: string, statement: string) => {
    setSelectedSchema(schema);
    setSql(statement);
    editorRef.current?.focus();
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
      </div>
    );
  }

  if (isError || !conn) {
    return (
      <Card className="p-8 text-center space-y-4">
        <p className="text-white/55">No se encontró la conexión</p>
        <button type="button" onClick={() => navigate(ROUTES.DATABASES)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium">
          Volver a Bases de Datos
        </button>
      </Card>
    );
  }

  return (
    <div className="mo-view h-full min-h-0 flex flex-col gap-5">
      {/* Cabecera */}
      <Card className="px-5 py-4 flex items-center gap-4 shrink-0">
        <button type="button" onClick={() => navigate(ROUTES.DATABASES)}
          aria-label="Volver a Bases de Datos" title="Volver"
          className="w-9 h-9 rounded-xl glass-soft row-hit text-white/65 hover:text-white flex items-center justify-center shrink-0">
          <DbIcon name="chevronL" />
        </button>
        <EngineBadge engine={conn.engine} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight truncate">{conn.name}</h1>
            {manageable && <SessionBadge status={session.status} />}
          </div>
          <div className="text-sm text-white/55 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{DATABASE_ENGINE_LABELS[conn.engine]}{conn.version && <span className="font-mono text-white/40"> · v{conn.version}</span>}</span>
            <span className="text-white/20">·</span>
            <span className="font-mono">{conn.host}<span className="text-white/40">:{conn.port}</span></span>
            {conn.username && (<><span className="text-white/20">·</span><span className="font-mono text-white/45">{conn.username}</span></>)}
          </div>
        </div>
        {manageable && (session.status === 'error' || session.status === 'closed') && (
          <div className="flex items-center gap-3 shrink-0 max-w-[45%]">
            <p className="text-xs text-rose-300 truncate" title={session.error ?? undefined}>{session.error}</p>
            <button type="button" onClick={session.reconnect}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft row-hit text-white/85 hover:text-white text-xs font-medium shrink-0">
              <DbIcon name="refresh" className="w-3.5 h-3.5" />
              Reconectar
            </button>
          </div>
        )}
      </Card>

      {!manageable ? (
        <div className="flex-1 glass edge-dashed elev-flat rounded-2xl grain relative flex flex-col items-center justify-center text-center gap-3 px-6">
          <span className="text-white/20"><DbIcon name="database" className="w-10 h-10" /></span>
          <div className="text-sm font-medium text-white/60">
            La gestión de {DATABASE_ENGINE_LABELS[conn.engine]} llega pronto
          </div>
          <p className="text-xs text-white/35 max-w-[320px]">Por ahora se pueden explorar y consultar conexiones MySQL, MariaDB y PostgreSQL.</p>
        </div>
      ) : (
        /* `grid-cols-[minmax(0,1fr)]`: sin él la columna implícita crece con la
           tabla de resultados y el scroll horizontal nunca aparece. */
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
          {/* Fila superior: bases (30 %) y editor (70 %) */}
          <div className="min-h-0 grid grid-cols-[minmax(0,3fr)_minmax(0,7fr)] gap-5">
            <Card className="min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 h-11 border-b border-line shrink-0">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Bases de datos</h3>
                <button type="button" onClick={() => void schemasQuery.refetch()}
                  disabled={schemasQuery.isFetching}
                  aria-label="Recargar bases" title="Recargar"
                  className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-tint-hover flex items-center justify-center">
                  <DbIcon name="refresh" className={`w-3.5 h-3.5 ${schemasQuery.isFetching ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scroll-thin scroll-layer p-2">
                {session.status === 'connecting' && <p className="px-2 py-2 text-xs text-white/40">Conectando…</p>}
                {(session.status === 'error' || session.status === 'closed') && (
                  <p className="px-2 py-2 text-xs text-white/40">Sin conexión. Usa «Reconectar» en la cabecera.</p>
                )}
                {schemasQuery.isLoading && <p className="px-2 py-2 text-xs text-white/40">Cargando bases…</p>}
                {schemasQuery.isError && (
                  <p className="px-2 py-2 text-xs text-rose-300">{errorMessage(schemasQuery.error)}</p>
                )}
                {schemasQuery.data && session.sessionId && (
                  <SchemaTree
                    connectionId={conn.id}
                    sessionId={session.sessionId}
                    dialect={engineDialect(conn.engine)}
                    schemas={schemasQuery.data}
                    activeSchema={activeSchema}
                    defaultExpanded={conn.database}
                    onSelectSchema={setSelectedSchema}
                    onPick={pickFromTree}
                  />
                )}
              </div>
            </Card>

            <Card className="min-h-0 flex flex-col overflow-hidden">
              <div className="flex items-center gap-3 px-4 h-11 border-b border-line shrink-0">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Editor SQL</h3>
                <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md ring-1 ${activeSchema
                  ? 'grad-brand-soft text-white/85 ring-hairline'
                  : 'bg-tint-active text-white/45 ring-hairline'}`}>
                  <DbIcon name="database" className="w-3 h-3" />
                  <span className="font-mono">{activeSchema ?? 'Sin base seleccionada'}</span>
                </span>
                <span className="flex-1" />
                <span className="text-[11px] text-white/35 hidden lg:inline">Ctrl + Enter ejecuta · con selección, solo lo seleccionado</span>
                <button type="button" onClick={() => setAuditOpen(true)}
                  title="Consultas peligrosas confirmadas sobre esta conexión"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg glass-soft row-hit text-white/70 hover:text-white text-xs font-medium shrink-0">
                  <DbIcon name="shield" className="w-3.5 h-3.5" />
                  Auditoría
                </button>
                <button type="button" onClick={run}
                  disabled={runQuery.isPending || !sql.trim() || session.status !== 'open'}
                  className="inline-flex items-center gap-2 h-8 px-3.5 rounded-lg grad-brand text-white text-xs font-semibold elev-brand-sm hover:elev-brand transition disabled:opacity-50 shrink-0">
                  {runQuery.isPending
                    ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    : <DbIcon name="play" className="w-3.5 h-3.5" />}
                  Ejecutar
                </button>
              </div>
              <div className="flex-1 min-h-0 flex p-3">
                <SqlEditor ref={editorRef} value={sql} dialect={engineDialect(conn.engine)} onChange={setSql} onRun={run} />
              </div>
            </Card>
          </div>

          {/* Fila inferior: resultados a todo el ancho */}
          <Card className="min-h-0 min-w-0 flex flex-col overflow-hidden">
            <QueryResults
              result={runQuery.data}
              error={errorMessage(runQuery.error)}
              running={runQuery.isPending}
              connectionId={id}
              sessionId={session.sessionId}
              fileName={exportName(conn.name, activeSchema)}
            />
          </Card>
        </div>
      )}

      <QueryAuditModal connectionId={id} isOpen={auditOpen} onClose={() => setAuditOpen(false)} />

      <Modal isOpen={pending !== null} onClose={() => setPending(null)} title="Confirmar consulta peligrosa" size="sm">
        {pending && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-rose-300 shrink-0 mt-0.5"><DbIcon name="warn" className="w-5 h-5" /></span>
              <div>
                <p className="text-sm font-semibold text-white">{pending.message}</p>
                {pending.hint && <p className="text-xs text-white/55 mt-1">{pending.hint}</p>}
              </div>
            </div>
            <pre className="p-3 rounded-lg bg-tint-sunken border border-hairline-soft text-xs font-mono text-white/80 whitespace-pre-wrap break-all max-h-48 overflow-y-auto scroll-thin">{pending.sql}</pre>
            <p className="text-xs text-white/45">
              Base: <span className="font-mono text-white/70">{pending.schema ?? 'sin base seleccionada'}</span>
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button type="button" onClick={() => setPending(null)}
                className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">
                Cancelar
              </button>
              <button type="button" onClick={confirmPending}
                className="h-10 px-4 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-sm font-semibold">
                Ejecutar igualmente
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
