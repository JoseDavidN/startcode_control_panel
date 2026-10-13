import React, { useEffect, useMemo, useState } from 'react';
import { ServerDetail } from '@components/servers/ServerDetail';
import { AddServerModal, EditServerModal, DeleteServerModal } from '@components/common';
import { type ServerData } from '@typings/DashboardTypes';
import { useServers, useRefreshAllServers } from '@hooks/useServers';
import type { Server } from '@services/server.service';
import { useServersLive } from '@hooks/useServersLive';
import { emptyRuntime, type ServerRuntime } from '@lib/serverRuntime';
import { formatUptime, timeAgo } from '@utils/time';
import { useAppearance } from '@contexts/AppearanceContext';
import type { ServersView } from '@contexts/AppearanceContext';
import { Card } from '@components/common/Card';
import { FilterMenu } from '@components/common/FilterMenu';
import { TagBadge } from '@components/common/TagBadge';
import { osLabel } from '@utils/servers';
import { TAG_OPTIONS, type ResourceTag } from '@utils/tags';

/* ── Glassmorphism primitives ─────────────────────────────────────── */

/* ── Tile ─────────────────────────────────────────────────────────── */
const Tile = ({ icon, label, value, tone = 'violet' }: {
  icon: React.ReactNode; label: string; value: string | number; tone?: string;
}) => {
  const tones: Record<string, string> = {
    violet:  'from-violet-500/25 to-violet-500/5 text-violet-300 ring-violet-400/20',
    emerald: 'from-emerald-500/25 to-emerald-500/5 text-emerald-300 ring-emerald-400/20',
    sky:     'from-sky-500/25 to-sky-500/5 text-sky-300 ring-sky-400/20',
    amber:   'from-amber-500/25 to-amber-500/5 text-amber-300 ring-amber-400/20',
    fuchsia: 'from-fuchsia-500/25 to-fuchsia-500/5 text-fuchsia-300 ring-fuchsia-400/20',
  };
  /* Ícono a la izquierda y dato al lado: la tarjeta no crece en alto por cada métrica. */
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${tones[tone] ?? tones.violet} ring-1 flex items-center justify-center backdrop-blur-md shrink-0 [&_svg]:w-4 [&_svg]:h-4`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/45 font-medium leading-tight">{label}</div>
        <div className="text-sm font-bold tracking-tight tabular-nums truncate">{value}</div>
      </div>
    </div>
  );
};

/* ── Inline icons ─────────────────────────────────────────────────── */
const I = ({ d, className = 'w-5 h-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
);

const icons = {
  server:   <I d="M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01" className="w-7 h-7" />,
  search:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  monitor:  <I d="M3 4h18v12H3zM8 20h8M12 16v4" className="w-6 h-6" />,
  plus:     <I d="M12 5v14M5 12h14" className="w-4 h-4" />,
  cpu:      <I d="M6 6h12v12H6zM9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" className="w-5 h-5" />,
  ram:      <I d="M2.5 7h19v10H2.5zM7 11v2M11 11v2M15 11v2M19 11v2M5 17v2M9 17v2M13 17v2M17 17v2" className="w-5 h-5" />,
  disk:     <I d="M3 4h18v16H3zM3 14h18" className="w-5 h-5" />,
  activity: <I d="M3 12h4l3-8 4 16 3-8h4" className="w-5 h-5" />,
  uptime:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  wrench:   <I d="M14.7 6.3a4 4 0 015.7 5.1l-1.4-1.5-2.1 2.1 1.4 1.4a4 4 0 01-5.1-5.7L4.4 17.6a2 2 0 102.8 2.8l8.2-8.2" className="w-5 h-5" />,
  clock:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  chevron:  <I d="M9 6l6 6-6 6" className="w-5 h-5" />,
  cards:    <I d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" className="w-4 h-4" />,
  list:     <I d="M4 6h16M4 12h16M4 18h16" className="w-4 h-4" />,
  edit:     <I d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" className="w-4 h-4" />,
  trash:    <I d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" className="w-4 h-4" />,
};

/* ── Acciones de la tarjeta ───────────────────────────────────────── */
/* Van fuera del área clicable: la tarjeta entera abre el detalle, así que
   estos botones paran la propagación para no arrastrar al usuario con ellos. */
const RowActions = ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => (
  <div className="flex items-center gap-1 shrink-0">
    <button
      onClick={e => { e.stopPropagation(); onEdit(); }}
      title="Editar servidor" aria-label="Editar servidor"
      className="mo-tab w-8 h-8 rounded-lg glass-soft text-white/55 hover:text-white row-hit flex items-center justify-center"
    >
      {icons.edit}
    </button>
    <button
      onClick={e => { e.stopPropagation(); onDelete(); }}
      title="Eliminar servidor" aria-label="Eliminar servidor"
      className="mo-tab w-8 h-8 rounded-lg glass-soft text-white/50 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center"
    >
      {icons.trash}
    </button>
  </div>
);

/* ── Métricas derivadas — compartidas por la tarjeta y la fila ────── */

/* Formatea un número que puede no existir todavía: sin dato se pinta «—», no
   un cero que parecería una medición. */
const dash = '—';
const pct = (value: number | null): string => (value === null ? dash : `${value.toFixed(1)}%`);
const count = (value: number | null): string => (value === null ? dash : String(value));

const StatusBadge = ({ status }: { status: ServerRuntime['state'] }) => {
  if (status === 'online')  return <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">Online</span>;
  if (status === 'warning') return <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20">Atención</span>;
  /* Un servidor que nunca ha reportado no está caído: es que aún no dice nada.
     Chip neutro por el canal de tinta, que funciona en los tres temas. */
  if (status === 'unknown') return <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-tint-active text-white/55 ring-1 ring-hairline">Sin datos</span>;
  return <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20">Offline</span>;
};

/* ── Server card (glassmorphism) ──────────────────────────────────── */
const GlassServerCard = ({ server, tag, rt, onClick, onEdit, onDelete }: {
  server: ServerData;
  tag: ResourceTag | null;
  rt: ServerRuntime;
  onClick: (s: ServerData) => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  return (
    /* No es un <button>: dentro hay botones de acción y anidarlos sería HTML
       inválido además de robarles el clic. */
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(server)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(server); } }}
      className="text-left group w-full cursor-pointer"
    >
      <Card className="p-4 row-hit relative">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grad-brand-soft border border-hairline flex items-center justify-center text-violet-200 shrink-0 [&_svg]:w-5 [&_svg]:h-5">
            {icons.monitor}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-semibold truncate">{server.name}</div>
              <TagBadge tag={tag} />
            </div>
            <div className="text-xs text-white/55 mt-0.5 font-mono truncate">
              {server.ip} · {server.os}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <RowActions onEdit={onEdit} onDelete={onDelete} />
            <span className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition">
              {icons.chevron}
            </span>
          </div>
        </div>

        {/* Metric tiles row 1 */}
        <div className={`grid grid-cols-3 gap-x-3 gap-y-3 mt-4 ${rt.stale ? 'opacity-60' : ''}`}
          title={rt.stale ? `Último reporte ${timeAgo(rt.lastMetricAt)}` : undefined}>
          <Tile icon={icons.cpu}    label="CPU"   value={pct(rt.cpu)}    tone="emerald" />
          <Tile icon={icons.ram}    label="RAM"   value={pct(rt.memory)} tone="sky" />
          <Tile icon={icons.disk}   label="Disco" value={pct(rt.disk)}   tone="violet" />
        </div>

        {/* Metric tiles row 2: lo que el agente sí reporta */}
        <div className={`grid grid-cols-3 gap-x-3 gap-y-3 mt-3 ${rt.stale ? 'opacity-60' : ''}`}>
          <Tile icon={icons.wrench}   label="Servicios" value={count(rt.services)}  tone="fuchsia" />
          <Tile icon={icons.activity} label="Procesos"  value={count(rt.processes)} tone="amber" />
          <Tile icon={icons.uptime}   label="Activo"    value={rt.uptime === null ? dash : formatUptime(rt.uptime)} tone="sky" />
        </div>

        {/* Footer: estado de conexión (con el punto «en vivo» pegado) y servicios */}
        <div className="border-t border-line mt-4 pt-3 flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 min-w-0">
            <StatusBadge status={rt.state} />
            {rt.live && rt.state === 'online' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 glow-ok animate-pulse shrink-0" aria-label="Métricas en vivo" />
            )}
            {!rt.hasMetrics && <span className="text-xs text-white/40 truncate">Instala el agente para ver métricas</span>}
          </span>
          {rt.servicesTotal !== null && (
            <span className="text-xs text-white/45 tabular-nums">
              {count(rt.services)} de {rt.servicesTotal} servicios activos
            </span>
          )}
        </div>
      </Card>
    </div>
  );
};

/* ── Métrica compacta para la vista de lista ──────────────────────── */
const MiniMetric = ({ label, value, gradient }: { label: string; value: number | null; gradient: string }) => (
  <div className="w-24">
    <div className="flex items-baseline justify-between mb-1">
      <span className="text-[10px] uppercase tracking-wider text-white/45 font-medium">{label}</span>
      <span className={`text-xs font-mono tabular-nums ${value === null ? 'text-white/45' : 'text-white/80'}`}>
        {value === null ? dash : `${value.toFixed(0)}%`}
      </span>
    </div>
    <div className="bg-track h-1.5 rounded-full overflow-hidden">
      {/* Sin dato, la pista se queda vacía: una barra a cero diría que se midió cero. */}
      {value !== null && (
        <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      )}
    </div>
  </div>
);

/* ── Fila (vista de lista) ────────────────────────────────────────── */
const ServerRow = ({ server, tag, rt, onClick, onEdit, onDelete }: {
  server: ServerData;
  tag: ResourceTag | null;
  rt: ServerRuntime;
  onClick: (s: ServerData) => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(server)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(server); } }}
      className="w-full text-left group flex items-center gap-4 px-5 py-4 hover:bg-tint-hover transition cursor-pointer"
    >
      <div className="w-10 h-10 rounded-xl grad-brand-soft border border-hairline flex items-center justify-center text-violet-200 shrink-0">
        {icons.monitor}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold truncate">{server.name}</span>
          {/* El punto «en vivo» va pegado al estado, antes de la etiqueta. */}
          <StatusBadge status={rt.state} />
          {rt.live && rt.state === 'online' && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 glow-ok animate-pulse shrink-0 -ml-1" aria-label="Métricas en vivo" />
          )}
          <TagBadge tag={tag} />
        </div>
        <div className="text-xs text-white/55 mt-0.5 font-mono truncate">
          {server.ip} · {server.os}
        </div>
      </div>

      <div className={`hidden lg:flex items-center gap-5 shrink-0 ${rt.stale ? 'opacity-60' : ''}`}
        title={rt.stale ? `Último reporte ${timeAgo(rt.lastMetricAt)}` : undefined}>
        <MiniMetric label="CPU"   value={rt.cpu}
          gradient={rt.cpu !== null && rt.cpu >= 80 ? 'from-rose-500 to-orange-500' : 'from-emerald-500 to-teal-500'} />
        <MiniMetric label="RAM"   value={rt.memory} gradient="from-sky-500 to-blue-500" />
        <MiniMetric label="Disco" value={rt.disk}   gradient="from-violet-500 to-fuchsia-500" />
      </div>

      <div className="hidden md:flex items-center gap-4 text-xs text-white/55 shrink-0 tabular-nums">
        <span title="Servicios activos" className="flex items-center gap-1.5">
          <span className="text-fuchsia-300">{icons.wrench}</span>{count(rt.services)}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-white/75">
          {icons.clock}{rt.uptime === null ? dash : formatUptime(rt.uptime)}
        </span>
      </div>

      <RowActions onEdit={onEdit} onDelete={onDelete} />

      <span className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition shrink-0">
        {icons.chevron}
      </span>
    </div>
  );
};

/* ── Filtros ──────────────────────────────────────────────────────── */
/* '' = sin filtro; 'none' en la etiqueta = servidores sin etiqueta. */
interface ServerFilters { os: string; tag: ResourceTag | 'none' | '' }
const NO_FILTERS: ServerFilters = { os: '', tag: '' };

/* ── Selector de vista ────────────────────────────────────────────── */
const ViewToggle = ({ value, onChange }: { value: ServersView; onChange: (v: ServersView) => void }) => {
  const options: [ServersView, string, React.ReactNode][] = [
    ['cards', 'Vista de tarjetas', icons.cards],
    ['list',  'Vista de lista',    icons.list],
  ];
  return (
    <div role="radiogroup" aria-label="Modo de vista" className="glass-soft rounded-xl h-10 flex items-center gap-1 p-1 shrink-0">
      {options.map(([mode, label, icon]) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(mode)}
            className={`mo-tab w-9 h-8 rounded-lg flex items-center justify-center
              ${active
                ? 'mo-tab-on grad-brand text-white elev-brand-sm'
                : 'text-white/50 hover:text-white hover:bg-tint-hover'}`}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
};

/* ── Servidores ───────────────────────────────────────────────────────
   La página ocupa exactamente el alto del contenedor principal (h-full):
   cabecera y buscador fijos, y solo la rejilla desplaza su contenido. */
export const Servers: React.FC = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<ServerData | null>(null);
  /* Los modales trabajan con el servidor crudo del backend, no con ServerData. */
  const [editing, setEditing] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState<Server | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<ServerFilters>(NO_FILTERS);

  /* Preferencia persistida en la cuenta del usuario */
  const { serversView, setServersView } = useAppearance();

  const { data: servers = [], isLoading, isError } = useServers();
  const { mutate: refreshServers } = useRefreshAllServers();
  /* Los números vienen de aquí, no de `GET /servers`: `metadata.cpu` y compañía
     no los escribe nadie en el backend. */
  const { runtime, onlineCount } = useServersLive();

  const transformServer = (s: Server): ServerData => {
    const rt = runtime[s.id];
    return {
      id: s.id, name: s.name,
      status: s.status === 'online' ? 'online'
        : (s.status === 'offline' || s.status === 'error') ? 'offline'
        : 'warning',
      /* `ServerData` no admite nulos y es lo que recibe el detalle; los ceros
         de aquí solo son el valor de arranque, el pintado usa `rt`. */
      cpu: rt?.cpu ?? 0, memory: rt?.memory ?? 0, disk: rt?.disk ?? 0,
      uptime: rt?.uptime != null ? String(rt.uptime) : 'N/A',
      activeServices: rt?.services ?? 0,
      location: 'N/A', ip: s.host, os: s.os, services: [], websites: [], databases: [],
    };
  };

  const osList = useMemo(() => [...new Set(servers.map(s => s.os))].sort((a, b) => osLabel(a).localeCompare(osLabel(b))), [servers]);

  const filteredServers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return servers.filter(s =>
      (!term || s.name.toLowerCase().includes(term) || s.host.toLowerCase().includes(term)) &&
      (!filters.os || s.os === filters.os) &&
      (!filters.tag || (filters.tag === 'none' ? !s.tag : s.tag === filters.tag))
    );
  }, [servers, searchTerm, filters]);

  /* Al entrar en la vista (y al volver del detalle) los datos se piden de nuevo. */
  const showingList = selectedServer === null;
  useEffect(() => {
    if (showingList) refreshServers();
  }, [showingList, refreshServers]);

  if (selectedServer) {
    return <ServerDetail key={selectedServer.id} server={selectedServer} onBack={() => setSelectedServer(null)} />;
  }

  return (
    <div className="mo-view h-full min-h-0 flex flex-col gap-5">
      {/* Page header */}
      <Card className="px-6 py-5 flex items-center gap-4 shrink-0">
        <div className="w-14 h-14 rounded-2xl grad-brand flex items-center justify-center elev-brand">
          <span className="text-white">{icons.server}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Servidores</h1>
          <p className="text-sm text-white/55 mt-0.5">
            {servers.length === 0
              ? 'Aún no hay servidores registrados'
              : `${onlineCount} de ${servers.length} en línea`}
          </p>
        </div>
      </Card>

      {/* Search + vista + filtros */}
      {/* Encima de la rejilla: el menú de filtros cae sobre las tarjetas. */}
      <Card className="p-3 flex items-center gap-3 shrink-0 relative z-20">
        <div className="flex-1 flex items-center gap-2 px-3 min-w-0">
          {icons.search}
          <input
            className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-white/40 py-2.5 text-white/90"
            placeholder="Buscar servidores por nombre o IP…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <ViewToggle value={serversView} onChange={setServersView} />

        <FilterMenu
          onClear={() => setFilters(NO_FILTERS)}
          groups={[
            {
              id: 'os', label: 'Sistema operativo', allLabel: 'Todos', value: filters.os,
              options: osList.map(os => ({ value: os, label: osLabel(os) })),
              onChange: os => setFilters(f => ({ ...f, os })),
            },
            {
              id: 'tag', label: 'Etiqueta', allLabel: 'Todas', value: filters.tag,
              options: [...TAG_OPTIONS, { value: 'none', label: 'Sin etiqueta' }],
              onChange: tag => setFilters(f => ({ ...f, tag: tag as ServerFilters['tag'] })),
            },
          ]}
        />
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white elev-brand hover:elev-brand-hi text-sm font-medium transition shrink-0"
        >
          {icons.plus} Agregar servidor
        </button>
      </Card>

      {/* Solo esta zona desplaza: el contenedor principal nunca cambia de alto */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-area">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
          </div>
        )}

        {isError && (
          <Card className="p-8 text-center">
            <p className="text-white/55">Error al cargar los servidores</p>
          </Card>
        )}

        {!isLoading && !isError && servers.length > 0 && filteredServers.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-white/55">Ningún servidor coincide con la búsqueda o los filtros</p>
          </Card>
        )}

        {!isLoading && !isError && serversView === 'cards' && (
          <div className="mo-panel grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
            {filteredServers.map(server => (
              <GlassServerCard
                key={server.id}
                server={transformServer(server)}
                tag={server.tag ?? null}
                rt={runtime[server.id] ?? emptyRuntime(server.id, server.status)}
                onClick={setSelectedServer}
                onEdit={() => setEditing(server)}
                onDelete={() => setDeleting(server)}
              />
            ))}
          </div>
        )}

        {!isLoading && !isError && serversView === 'list' && (
          <div className="mo-panel space-y-3">
            {filteredServers.length > 0 && (
              <Card className="overflow-hidden divide-y divide-line">
                {filteredServers.map(server => (
                  <ServerRow
                    key={server.id}
                    server={transformServer(server)}
                    tag={server.tag ?? null}
                    rt={runtime[server.id] ?? emptyRuntime(server.id, server.status)}
                    onClick={setSelectedServer}
                    onEdit={() => setEditing(server)}
                    onDelete={() => setDeleting(server)}
                  />
                ))}
              </Card>
            )}

          </div>
        )}
      </div>

      {/* Add server modal */}
      <AddServerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => setIsAddModalOpen(false)}
      />

      <EditServerModal server={editing} onClose={() => setEditing(null)} />
      <DeleteServerModal server={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
};
