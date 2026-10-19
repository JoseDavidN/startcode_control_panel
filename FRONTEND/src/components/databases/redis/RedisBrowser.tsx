import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@components/common/Card';
import { Select } from '@components/common/Select';
import { DbIcon } from '@components/databases/icons';
import { QueryAuditModal } from '@components/databases/QueryAuditModal';
import { RedisConsole } from '@components/databases/redis/RedisConsole';
import { RedisNewKeyModal } from '@components/databases/redis/RedisNewKeyModal';
import { RedisValuePanel } from '@components/databases/redis/RedisValuePanel';
import { TypeBadge } from '@components/databases/redis/redisUi';
import { iconBtn, messageOf, smallBtn } from '@components/databases/redis/redisStyles';
import { isSessionClosedError } from '@hooks/useDatabases';
import { useRedisOverview, useRedisScan } from '@hooks/useRedis';
import { formatBytes } from '@utils/metrics';
import { formatTtl, toScanPattern } from '@utils/redis';
import { REDIS_KEY_TYPES, REDIS_TYPE_LABELS, type RedisKeyType } from '@typings/redis.types';
import type { DatabaseConnection } from '@typings/database.types';

interface Props {
  conn: DatabaseConnection;
  sessionId: string | null;
  onSessionClosed: () => void;
}

/* Al escribir en el buscador se espera a que pare para no lanzar un SCAN por tecla. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Gestión de una conexión Redis. Arriba, claves de la base elegida (30 %) y el
 * valor de la seleccionada (70 %); abajo, a todo el ancho, la consola. Todo va
 * por la sesión de la vista, igual que el editor SQL.
 */
export const RedisBrowser: React.FC<Props> = ({ conn, sessionId, onSessionClosed }) => {
  const [db, setDb] = useState(() => Number(conn.database ?? 0) || 0);
  const [search, setSearch] = useState('');
  const [pattern, setPattern] = useState('*');
  const [type, setType] = useState<RedisKeyType | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPattern(toScanPattern(search)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const overview = useRedisOverview(conn.id, sessionId);
  const scan = useRedisScan(conn.id, sessionId, db, pattern, type);
  const keys = useMemo(() => {
    const seen = new Set<string>();
    /* SCAN puede repetir una clave entre páginas. */
    return (scan.data?.pages ?? []).flatMap(p => p.keys).filter(k => (seen.has(k.key) ? false : (seen.add(k.key), true)));
  }, [scan.data]);

  /* Si el backend dice que la sesión ya no existe, la cabecera ofrece reconectar. */
  useEffect(() => {
    if (isSessionClosedError(scan.error) || isSessionClosedError(overview.error)) onSessionClosed();
  }, [scan.error, overview.error, onSessionClosed]);

  const info = overview.data;
  const dbCount = info?.databases ?? 16;
  const keyspace = new Map((info?.keyspace ?? []).map(k => [k.db, k]));
  const dbOptions = Array.from({ length: dbCount }, (_, i) => ({
    value: i, label: `db${i}`, hint: keyspace.has(i) ? `${keyspace.get(i)!.keys.toLocaleString('es')} claves` : 'vacía',
  }));
  const typeOptions = [{ value: '' as const, label: 'Todos los tipos' }, ...REDIS_KEY_TYPES.map(t => ({ value: t, label: REDIS_TYPE_LABELS[t] }))];
  const inDb = keyspace.get(db)?.keys ?? 0;

  const changeDb = (next: number) => { setDb(next); setSelected(null); };

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
      <div className="min-h-0 grid grid-cols-[minmax(0,3fr)_minmax(0,7fr)] gap-5">
        {/* ── Claves ── */}
        <Card className="min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 h-11 border-b border-line shrink-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Claves</h3>
            <div className="flex items-center gap-1">
              <button type="button" className={iconBtn} title="Volver a buscar" onClick={() => { void scan.refetch(); void overview.refetch(); }}>
                <DbIcon name="refresh" className={`w-3.5 h-3.5 ${scan.isFetching ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" className={smallBtn} disabled={!sessionId} onClick={() => setNewKeyOpen(true)}>
                <span className="text-sm leading-none">+</span>Nueva
              </button>
            </div>
          </div>

          <div className="p-3 space-y-2 border-b border-line shrink-0">
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
              <div className="glass-input rounded-lg h-8 flex items-center px-2.5">
                <Select value={db} options={dbOptions} onChange={changeDb} aria-label="Base de Redis" className="flex-1 text-xs font-mono text-white/90" />
              </div>
              <div className="glass-input rounded-lg h-8 flex items-center px-2.5">
                <Select value={type ?? ''} options={typeOptions} onChange={v => { setType(v || null); setSelected(null); }}
                  aria-label="Tipo de clave" className="flex-1 text-xs text-white/90" />
              </div>
            </div>
            <div className="glass-input rounded-lg h-8 flex items-center gap-2 px-2.5" title="Sin * ni ? busca las claves que contienen el texto; con ellos, el patrón tal cual (user:*)">
              <DbIcon name="search" className="w-3.5 h-3.5 text-white/35 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar o patrón (user:*)" spellCheck={false}
                aria-label="Buscar claves" className="flex-1 min-w-0 bg-transparent outline-none text-xs font-mono placeholder:text-white/30 text-white/90" />
              {search && (
                <button type="button" className={iconBtn} title="Limpiar la búsqueda" onClick={() => setSearch('')}>
                  <DbIcon name="close" className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin py-1">
            {scan.isLoading && <p className="text-xs text-white/40 text-center py-6">Buscando…</p>}
            {scan.isError && !isSessionClosedError(scan.error) && <p className="text-xs text-rose-300 text-center py-6 px-4">{messageOf(scan.error)}</p>}
            {!scan.isLoading && !scan.isError && keys.length === 0 && !scan.hasNextPage && (
              <p className="text-xs text-white/40 text-center py-6 px-4">
                {pattern === '*' && !type ? `db${db} no tiene claves` : 'Ninguna clave coincide'}
              </p>
            )}
            {keys.map(k => (
              <button key={k.key} type="button" onClick={() => setSelected(k.key)} title={k.key}
                className={`w-full flex items-center gap-2 px-3 h-8 text-left transition-colors ${selected === k.key ? 'bg-tint-active text-white' : 'text-white/75 hover:bg-tint-hover hover:text-white'}`}>
                <TypeBadge type={k.type} />
                <span className="flex-1 min-w-0 truncate text-xs font-mono">{k.key}</span>
                {k.ttl >= 0 && <span className="text-[10px] text-white/35 shrink-0 tabular-nums" title="Caduca en">{formatTtl(k.ttl)}</span>}
              </button>
            ))}
            {scan.hasNextPage && (
              <div className="p-2">
                <button type="button" className={`${smallBtn} w-full`} disabled={scan.isFetchingNextPage} onClick={() => void scan.fetchNextPage()}>
                  {scan.isFetchingNextPage ? 'Buscando…' : 'Cargar más'}
                </button>
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-line text-[11px] text-white/40 shrink-0 flex flex-wrap gap-x-2 gap-y-0.5">
            <span>{keys.length.toLocaleString('es')}{scan.hasNextPage ? '+' : ''} de {inDb.toLocaleString('es')} en db{db}</span>
            {info?.usedMemory != null && (
              <span title="Memoria usada / límite (maxmemory)">· {formatBytes(info.usedMemory)}{info.maxMemory ? ` / ${formatBytes(info.maxMemory)}` : ''}</span>
            )}
            {info?.connectedClients != null && <span>· {info.connectedClients} {info.connectedClients === 1 ? 'cliente' : 'clientes'}</span>}
            {info?.role === 'slave' && <span className="text-amber-300/80">· réplica</span>}
          </div>
        </Card>

        {/* ── Valor ── */}
        <Card className="min-h-0 flex flex-col overflow-hidden">
          {selected ? (
            <RedisValuePanel key={`${db}\u0000${selected}`} connectionId={conn.id} sessionId={sessionId} db={db} keyName={selected}
              onGone={renamed => setSelected(renamed ?? null)} />
          ) : (
            <div className="flex-1 m-4 edge-dashed rounded-xl flex flex-col items-center justify-center gap-2 text-center px-6">
              <span className="text-white/20"><DbIcon name="key" className="w-9 h-9" /></span>
              <p className="text-sm font-medium text-white/60">Elige una clave para ver su valor</p>
              <p className="text-xs text-white/35 max-w-[340px]">Texto, hash, lista, conjunto, conjunto ordenado y stream se editan aquí; los demás tipos, desde la consola.</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Consola ── */}
      <Card className="min-h-0 flex flex-col overflow-hidden">
        <RedisConsole connectionId={conn.id} connectionName={conn.name} sessionId={sessionId} db={db}
          onSessionClosed={onSessionClosed} onAudit={() => setAuditOpen(true)} />
      </Card>

      <RedisNewKeyModal isOpen={newKeyOpen} onClose={() => setNewKeyOpen(false)} connectionId={conn.id} sessionId={sessionId} db={db}
        onCreated={key => setSelected(key)} />
      <QueryAuditModal connectionId={conn.id} isOpen={auditOpen} onClose={() => setAuditOpen(false)} />
    </div>
  );
};
