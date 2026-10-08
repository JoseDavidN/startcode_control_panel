import React, { useMemo, useState } from 'react';
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
  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tones[tone] ?? tones.violet} ring-1 flex items-center justify-center backdrop-blur-md`}>
        {icon}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-white/45 font-medium">{label}</div>
      <div className="text-lg font-bold tracking-tight">{value}</div>
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
  filter:   <I d="M3 5h18l-7 9v6l-4-2v-4L3 5z" className="w-4 h-4" />,
  refresh:  <I d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5" className="w-4 h-4" />,
  monitor:  <I d="M3 4h18v12H3zM8 20h8M12 16v4" className="w-6 h-6" />,
  plus:     <I d="M12 5v14M5 12h14" className="w-7 h-7" />,
  plusSm:   <I d="M12 5v14M5 12h14" className="w-5 h-5" />,
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
      className="mo-tab w-9 h-9 rounded-xl glass-soft text-white/55 hover:text-white row-hit flex items-center justify-center"
    >
      {icons.edit}
    </button>
    <button
      onClick={e => { e.stopPropagation(); onDelete(); }}
      title="Eliminar servidor" aria-label="Eliminar servidor"
      className="mo-tab w-9 h-9 rounded-xl glass-soft text-white/50 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center"
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
const GlassServerCard = ({ server, rt, onClick, onEdit, onDelete }: {
  server: ServerData;
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
      <Card className="p-5 row-hit relative">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl grad-brand-soft border border-hairline flex items-center justify-center text-violet-200">
            {icons.monitor}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-lg">{server.name}</div>
              <StatusBadge status={rt.state} />
              {rt.live && rt.state === 'online' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 glow-ok animate-pulse" />
              )}
            </div>
            <div className="text-sm text-white/55 mt-0.5 font-mono">
              {server.ip} · {server.os}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RowActions onEdit={onEdit} onDelete={onDelete} />
            <span className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition">
              {icons.chevron}
            </span>
          </div>
        </div>

        {/* Metric tiles row 1 */}
        <div className={`grid grid-cols-3 gap-4 mt-5 ${rt.stale ? 'opacity-60' : ''}`}
          title={rt.stale ? `Último reporte ${timeAgo(rt.lastMetricAt)}` : undefined}>
          <Tile icon={icons.cpu}    label="CPU"   value={pct(rt.cpu)}    tone="emerald" />
          <Tile icon={icons.ram}    label="RAM"   value={pct(rt.memory)} tone="sky" />
          <Tile icon={icons.disk}   label="Disco" value={pct(rt.disk)}   tone="violet" />
        </div>

        {/* Metric tiles row 2: lo que el agente sí reporta */}
        <div className={`grid grid-cols-3 gap-4 mt-4 ${rt.stale ? 'opacity-60' : ''}`}>
          <Tile icon={icons.wrench}   label="Servicios" value={count(rt.services)}  tone="fuchsia" />
          <Tile icon={icons.activity} label="Procesos"  value={count(rt.processes)} tone="amber" />
          <Tile icon={icons.uptime}   label="Activo"    value={rt.uptime === null ? dash : formatUptime(rt.uptime)} tone="sky" />
        </div>

        {/* Footer: frescura del dato */}
        <div className="border-t border-line mt-5 pt-4 flex items-center justify-between gap-3 text-sm">
          {rt.hasMetrics ? (
            <span className={`flex items-center gap-2 ${rt.stale ? 'text-amber-300' : 'text-white/55'}`}>
              {icons.clock}
              <span className="text-xs">Último reporte</span>
              <span className="text-xs font-mono">{timeAgo(rt.lastMetricAt)}</span>
            </span>
          ) : (
            <span className="text-white/40">Instala el agente para ver métricas</span>
          )}
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
const ServerRow = ({ server, rt, onClick, onEdit, onDelete }: {
  server: ServerData;
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
          <StatusBadge status={rt.state} />
          {rt.live && rt.state === 'online' && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 glow-ok animate-pulse shrink-0" />
          )}
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

  /* Preferencia persistida en la cuenta del usuario */
  const { serversView, setServersView } = useAppearance();

  const { data: servers = [], isLoading, isError } = useServers();
  const refreshMutation = useRefreshAllServers();
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

  const filteredServers = useMemo(
    () => servers.filter(s =>
      !searchTerm ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.host.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [servers, searchTerm]
  );

  if (selectedServer) {
    return <ServerDetail server={selectedServer} onBack={() => setSelectedServer(null)} />;
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
      <Card className="p-3 flex items-center gap-3 shrink-0">
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

        <button className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium transition shrink-0">
          {icons.filter} Filtros
        </button>
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white elev-brand hover:elev-brand-hi text-sm font-medium transition disabled:opacity-60 shrink-0"
        >
          {icons.refresh} Actualizar
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

        {!isLoading && !isError && serversView === 'cards' && (
          <div className="mo-panel grid grid-cols-1 xl:grid-cols-2 gap-5">
            {filteredServers.map(server => (
              <GlassServerCard
                key={server.id}
                server={transformServer(server)}
                rt={runtime[server.id] ?? emptyRuntime(server.id, server.status)}
                onClick={setSelectedServer}
                onEdit={() => setEditing(server)}
                onDelete={() => setDeleting(server)}
              />
            ))}

            {/* Add new server tile */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="glass edge-dashed elev-flat rounded-2xl transition group flex items-center justify-center min-h-[280px] grain relative cursor-pointer"
            >
              <div className="flex flex-col items-center gap-3 text-white/40 group-hover:text-white/70 transition">
                <div className="w-14 h-14 rounded-2xl grad-brand-soft border border-hairline flex items-center justify-center">
                  {icons.plus}
                </div>
                <div className="text-sm font-medium">Agregar nuevo servidor</div>
                <div className="text-xs text-white/35 max-w-[260px] text-center">
                  Conecta una máquina nueva para empezar a monitorearla en tiempo real.
                </div>
              </div>
            </button>
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
                    rt={runtime[server.id] ?? emptyRuntime(server.id, server.status)}
                    onClick={setSelectedServer}
                    onEdit={() => setEditing(server)}
                    onDelete={() => setDeleting(server)}
                  />
                ))}
              </Card>
            )}

            {/* Add new server row */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="w-full glass edge-dashed elev-flat rounded-2xl grain relative group flex items-center gap-4 px-5 py-4 transition cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl grad-brand-soft border border-hairline flex items-center justify-center text-white/50 group-hover:text-white/80 transition shrink-0">
                {icons.plusSm}
              </div>
              <div className="text-left text-white/40 group-hover:text-white/70 transition">
                <div className="text-sm font-medium">Agregar nuevo servidor</div>
                <div className="text-xs text-white/35">
                  Conecta una máquina nueva para empezar a monitorearla en tiempo real.
                </div>
              </div>
            </button>
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
