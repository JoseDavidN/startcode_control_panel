import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@components/common/Card';
import { FilterMenu } from '@components/common/FilterMenu';
import { TagBadge } from '@components/common/TagBadge';
import { DATABASE_ENGINES, DATABASE_ENGINE_LABELS } from '@typings/database.types';
import type { DatabaseConnection, DatabaseEngine } from '@typings/database.types';
import { TAG_OPTIONS, type ResourceTag } from '@utils/tags';
import { EngineBadge } from '@components/databases/EngineIcon';
import { ConnectionModal } from '@components/databases/ConnectionModal';
import { useDatabaseConnections } from '@hooks/useDatabases';

/* 3 columnas × 3 filas: con muchas conexiones se pagina en vez de alargar la rejilla. */
const PAGE_SIZE = 9;

/* '' = sin filtro; 'none' en la etiqueta = conexiones sin etiqueta. */
interface ConnectionFilters { engine: DatabaseEngine | ''; tag: ResourceTag | 'none' | '' }
const NO_FILTERS: ConnectionFilters = { engine: '', tag: '' };

/* ── Primitivos locales (mismo patrón que Servers/Notifications) ───── */

const svg = (className: string) => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className,
});

const Icon = ({ name, className = 'w-4 h-4' }: { name: string; className?: string }) => {
  const p = svg(className);
  switch (name) {
    case 'database': return <svg {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>;
    case 'table':    return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></svg>;
    case 'host':     return <svg {...p}><path d="M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01" /></svg>;
    case 'user':     return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></svg>;
    case 'search':   return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case 'plus':     return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case 'chevron':  return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
    case 'edit':     return <svg {...p}><path d="M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3z" /><path d="M14 7l3 3" /></svg>;
    case 'chevronL': return <svg {...p}><path d="M15 6l-6 6 6 6" /></svg>;
    default:         return null;
  }
};

/* ── Tarjeta de conexión ───────────────────────────────────────────── */
const actionBtn = 'mo-tab w-9 h-9 rounded-xl glass-soft row-hit text-white/60 hover:text-white flex items-center justify-center disabled:opacity-50';

/* Sin estado de conexión: la tarjeta no conecta a nada. La conexión se prueba
   al crearla o editarla y solo se abre al entrar a su vista de consultas. */
const ConnectionCard = ({ conn, onOpen, onEdit }: {
  conn: DatabaseConnection;
  onOpen: () => void;
  onEdit: () => void;
}) => {
  /* No es un <button>: dentro hay botones de acción y anidarlos sería HTML
     inválido además de robarles el clic. */
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
      className="text-left w-full cursor-pointer rounded-2xl focus-ring"
    >
    <Card className="p-5 row-hit">
      {/* Cabecera: motor y nombre */}
      <div className="flex items-start gap-4">
        <EngineBadge engine={conn.engine} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-lg truncate">{conn.name}</div>
          <div className="text-sm text-white/55 mt-0.5">
            {DATABASE_ENGINE_LABELS[conn.engine]}
            {conn.version && <span className="font-mono text-white/40"> · v{conn.version}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={e => { e.stopPropagation(); onEdit(); }}
            aria-label="Editar conexión" title="Editar conexión" className={actionBtn}>
            <Icon name="edit" />
          </button>
        </div>
      </div>

      {/* Datos de la conexión */}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="rounded-xl bg-tint-sunken border border-hairline-soft px-3.5 py-3 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/45 font-medium">
            <Icon name="host" className="w-3.5 h-3.5" /> Host
          </div>
          <div className="mt-1.5 text-sm font-mono tabular-nums text-white/85 truncate">
            {conn.host}<span className="text-white/40">:{conn.port}</span>
          </div>
        </div>

        <div className="rounded-xl bg-tint-sunken border border-hairline-soft px-3.5 py-3 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/45 font-medium">
            <Icon name="table" className="w-3.5 h-3.5" /> Base de datos
          </div>
          {conn.database ? (
            <div className="mt-1.5 text-sm font-mono text-white/85 truncate" title={conn.database}>
              {conn.engine === 'redis' ? `db${conn.database}` : conn.database}
            </div>
          ) : (
            <div className="mt-1.5 text-sm text-white/40 truncate">Servidor completo</div>
          )}
        </div>
      </div>

      {/* Pie: usuario y, al otro extremo de la fila, la etiqueta */}
      <div className="border-t border-line mt-5 pt-4 flex items-center gap-2 text-xs text-white/55 min-w-0">
        <Icon name="user" />
        <span className="font-mono truncate flex-1 min-w-0">{conn.username || '—'}</span>
        <TagBadge tag={conn.tag} />
      </div>
    </Card>
    </div>
  );
};

/* ── Paginación ────────────────────────────────────────────────────── */
const Pagination = ({ page, pages, total, onChange }: {
  page: number; pages: number; total: number; onChange: (p: number) => void;
}) => {
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const navBtn = 'mo-tab w-9 h-9 rounded-xl glass-soft row-hit text-white/70 hover:text-white flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none';

  return (
    <Card className="p-3 flex items-center justify-between gap-3 shrink-0">
      <span className="px-3 text-xs text-white/45 tabular-nums">
        {from}–{to} de {total} conexiones
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Página anterior" className={navBtn}
          disabled={page === 1} onClick={() => onChange(page - 1)}>
          <Icon name="chevronL" />
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            type="button"
            aria-current={n === page ? 'page' : undefined}
            onClick={() => onChange(n)}
            className={`mo-tab min-w-9 h-9 px-2 rounded-xl text-sm font-medium tabular-nums
              ${n === page
                ? 'mo-tab-on grad-brand text-white elev-brand-sm'
                : 'text-white/60 hover:text-white hover:bg-tint-hover'}`}
          >
            {n}
          </button>
        ))}
        <button type="button" aria-label="Página siguiente" className={navBtn}
          disabled={page === pages} onClick={() => onChange(page + 1)}>
          <Icon name="chevron" />
        </button>
      </div>
    </Card>
  );
};

/* ── Bases de Datos ───────────────────────────────────────────────────
   Igual que Servidores: la página ocupa el alto del contenedor principal,
   cabecera, buscador y paginación fijos, y solo la rejilla desplaza su
   contenido si una página no cabe.
   Las conexiones son del usuario autenticado (`GET /databases`). */
export const Databases: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ConnectionFilters>(NO_FILTERS);
  /* null: cerrado; { conn: null }: nueva; { conn }: edición. */
  const [modal, setModal] = useState<{ conn: DatabaseConnection | null } | null>(null);
  const { data: connections = [], isLoading, isError } = useDatabaseConnections();
  const navigate = useNavigate();


  /* Solo los motores que tienen las conexiones de la cuenta. */
  const engines = useMemo(
    () => DATABASE_ENGINES.filter(e => connections.some(c => c.engine === e)),
    [connections],
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return connections.filter(c =>
      (!q ||
        c.name.toLowerCase().includes(q) ||
        c.host.toLowerCase().includes(q) ||
        (c.database ?? '').toLowerCase().includes(q) ||
        DATABASE_ENGINE_LABELS[c.engine].toLowerCase().includes(q)) &&
      (!filters.engine || c.engine === filters.engine) &&
      (!filters.tag || (filters.tag === 'none' ? !c.tag : c.tag === filters.tag)));
  }, [connections, searchTerm, filters]);

  const changeFilters = (next: ConnectionFilters) => { setFilters(next); setPage(1); };

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="mo-view h-full min-h-0 flex flex-col gap-5">
      {/* Cabecera */}
      <Card className="px-6 py-5 flex items-center gap-4 shrink-0">
        <div className="w-14 h-14 rounded-2xl grad-brand flex items-center justify-center elev-brand">
          <Icon name="database" className="w-7 h-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Bases de Datos</h1>
          <p className="text-sm text-white/55 mt-0.5">
            {connections.length === 0
              ? 'Aún no hay conexiones registradas'
              : `${connections.length} ${connections.length === 1 ? 'conexión guardada' : 'conexiones guardadas'}`}
          </p>
        </div>
      </Card>

      {/* Buscador; encima de la rejilla para que el menú de filtros caiga sobre las tarjetas */}
      <Card className="p-3 flex items-center gap-3 shrink-0 relative z-20">
        <div className="flex-1 flex items-center gap-2 px-3 min-w-0 text-white/45">
          <Icon name="search" />
          <input
            className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-white/40 py-2.5 text-white/90"
            placeholder="Buscar por nombre, motor, IP o base de datos…"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>

        <FilterMenu
          onClear={() => changeFilters(NO_FILTERS)}
          groups={[
            {
              id: 'engine', label: 'Motor', allLabel: 'Todos', value: filters.engine,
              options: engines.map(e => ({ value: e, label: DATABASE_ENGINE_LABELS[e] })),
              onChange: engine => changeFilters({ ...filters, engine: engine as ConnectionFilters['engine'] }),
            },
            {
              id: 'tag', label: 'Etiqueta', allLabel: 'Todas', value: filters.tag,
              options: [...TAG_OPTIONS, { value: 'none', label: 'Sin etiqueta' }],
              onChange: tag => changeFilters({ ...filters, tag: tag as ConnectionFilters['tag'] }),
            },
          ]}
        />

        <button
          type="button"
          onClick={() => setModal({ conn: null })}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white elev-brand hover:elev-brand-hi text-sm font-medium transition shrink-0"
        >
          <Icon name="plus" /> Agregar conexión
        </button>
      </Card>

      {/* Solo esta zona desplaza: el contenedor principal nunca cambia de alto */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-area">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
          </div>
        ) : isError ? (
          <Card className="p-8 text-center">
            <p className="text-white/55">Error al cargar las conexiones</p>
          </Card>
        ) : connections.length === 0 ? (
          <div className="glass edge-dashed elev-flat rounded-2xl grain relative flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
            <span className="text-white/20"><Icon name="database" className="w-10 h-10" /></span>
            <div className="text-sm font-medium text-white/60">Todavía no hay conexiones</div>
            <p className="text-xs text-white/35 max-w-[320px]">
              Agrega una conexión a MySQL, MariaDB, PostgreSQL o Redis con el botón «Agregar conexión».
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass edge-dashed elev-flat rounded-2xl grain relative flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
            <span className="text-white/20"><Icon name="database" className="w-10 h-10" /></span>
            <div className="text-sm font-medium text-white/60">Ninguna conexión coincide con la búsqueda o los filtros</div>
          </div>
        ) : (
          /* key por página ⇒ cada cambio de página entra con .mo-panel */
          <div key={current} className="mo-panel grid grid-cols-3 gap-5">
            {visible.map(conn => (
              <ConnectionCard
                key={conn.id}
                conn={conn}
                onOpen={() => navigate(`/databases/${conn.id}`)}
                onEdit={() => setModal({ conn })}
              />
            ))}
          </div>
        )}
      </div>

      {pages > 1 && (
        <Pagination page={current} pages={pages} total={filtered.length} onChange={setPage} />
      )}

      {modal && <ConnectionModal connection={modal.conn} onClose={() => setModal(null)} />}
    </div>
  );
};
