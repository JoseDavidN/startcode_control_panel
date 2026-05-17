import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ServerDetail } from '@components/servers';
import { AddServerModal } from '@components/common';
import { type ServerData } from '@typings/DashboardTypes';
import { useServers, useRefreshAllServers } from '@hooks/useServers';
import type { Server } from '@services/server.service';
import { useServerMetrics } from '@contexts/RealtimeMetricsContext';

/* ── Glassmorphism primitives ─────────────────────────────────────── */
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`glass rounded-2xl relative grain ${className}`}>{children}</div>
);

const Progress = ({ value = 0, gradient = 'from-violet-500 to-fuchsia-500', height = 'h-1.5' }: {
  value?: number; gradient?: string; height?: string;
}) => (
  <div className={`bg-white/[0.06] ${height} rounded-full overflow-hidden`}>
    <div
      className={`h-full bg-gradient-to-r ${gradient} rounded-full relative overflow-hidden transition-all duration-700`}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    >
      <div className="absolute inset-0 opacity-50" style={{
        backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shine 2.4s linear infinite',
      }} />
    </div>
  </div>
);

/* ── KPI card ─────────────────────────────────────────────────────── */
const Kpi = ({ label, value, sub, icon, tone = 'violet', accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; tone?: 'violet' | 'emerald' | 'sky' | 'amber'; accent?: string;
}) => {
  const tones: Record<string, { wrap: string; ring: string }> = {
    violet:  { wrap: 'from-violet-500/30 to-violet-500/10',   ring: 'ring-violet-400/25' },
    emerald: { wrap: 'from-emerald-500/30 to-emerald-500/10', ring: 'ring-emerald-400/25' },
    sky:     { wrap: 'from-sky-500/30 to-sky-500/10',         ring: 'ring-sky-400/25' },
    amber:   { wrap: 'from-amber-500/30 to-amber-500/10',     ring: 'ring-amber-400/25' },
  };
  const t = tones[tone];
  return (
    <Card className="p-5 flex items-center justify-between gap-4 hover:bg-white/[0.05] transition">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-white/50 font-medium">{label}</div>
        <div className={`text-4xl font-extrabold tracking-tight mt-1 ${accent ?? ''}`}>{value}</div>
        {sub && <div className="text-xs text-white/50 mt-1">{sub}</div>}
      </div>
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${t.wrap} ring-1 ${t.ring} flex items-center justify-center backdrop-blur-md`}>
        {icon}
      </div>
    </Card>
  );
};

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
const I = ({ d, cx, cy, r, className = 'w-5 h-5' }: {
  d?: string; cx?: number; cy?: number; r?: number; className?: string;
}) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    {cx !== undefined && cy !== undefined && r !== undefined && <circle cx={cx} cy={cy} r={r} />}
    {d && <path d={d} />}
  </svg>
);

const icons = {
  check:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-emerald-300"><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9.5"/></svg>,
  cube:     <I d="M21 7.5l-9-4.5-9 4.5v9l9 4.5 9-4.5v-9z M3 7.5L12 12l9-4.5M12 12v9" className="w-6 h-6" />,
  globe:    <I d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" className="w-6 h-6" />,
  database: <I d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" className="w-6 h-6" />,
  server:   <I d="M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01" className="w-7 h-7" />,
  search:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  filter:   <I d="M3 5h18l-7 9v6l-4-2v-4L3 5z" className="w-4 h-4" />,
  refresh:  <I d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5" className="w-4 h-4" />,
  monitor:  <I d="M3 4h18v12H3zM8 20h8M12 16v4" className="w-6 h-6" />,
  plus:     <I d="M12 5v14M5 12h14" className="w-7 h-7" />,
  cpu:      <I d="M6 6h12v12H6zM9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" className="w-5 h-5" />,
  ram:      <I d="M2.5 7h19v10H2.5zM7 11v2M11 11v2M15 11v2M19 11v2M5 17v2M9 17v2M13 17v2M17 17v2" className="w-5 h-5" />,
  disk:     <I d="M3 4h18v16H3zM3 14h18" className="w-5 h-5" />,
  wrench:   <I d="M14.7 6.3a4 4 0 015.7 5.1l-1.4-1.5-2.1 2.1 1.4 1.4a4 4 0 01-5.1-5.7L4.4 17.6a2 2 0 102.8 2.8l8.2-8.2" className="w-5 h-5" />,
  clock:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  chevron:  <I d="M9 6l6 6-6 6" className="w-5 h-5" />,
};

/* ── Server card (glassmorphism) ──────────────────────────────────── */
const GlassServerCard = ({ server, onClick }: { server: ServerData; onClick: (s: ServerData) => void }) => {
  const rt = useServerMetrics(server.id);

  const cpu    = Number(rt.metrics?.cpu    ?? server.cpu    ?? 0);
  const memory = Number(rt.metrics?.memory ?? server.memory ?? 0);
  const disk   = Number(rt.metrics?.disk   ?? server.disk   ?? 0);
  const uptime = rt.metrics?.uptime ?? server.uptime ?? 'N/A';
  const servicesCount  = rt.servicesCount  ?? rt.services?.length  ?? server.activeServices ?? 0;
  const websitesCount  = rt.websites?.length  ?? server.websites?.length  ?? 0;
  const databasesCount = rt.databases?.length ?? server.databases?.length ?? 0;

  const formatUptime = (u: string | number | undefined): string => {
    if (!u || u === 'N/A') return 'N/A';
    let weeks = 0, days = 0, hours = 0, minutes = 0;
    if (typeof u === 'number') {
      const totalMinutes = Math.floor(u / 60);
      const totalHours   = Math.floor(totalMinutes / 60);
      const totalDays    = Math.floor(totalHours / 24);
      weeks   = Math.floor(totalDays / 7);
      days    = totalDays % 7;
      hours   = totalHours % 24;
      minutes = totalMinutes % 60;
    } else {
      u.split(', ').forEach(part => {
        if (part.includes('week'))   weeks   = parseInt(part);
        else if (part.includes('day'))    days    = parseInt(part);
        else if (part.includes('hour'))   hours   = parseInt(part);
        else if (part.includes('minute')) minutes = parseInt(part);
      });
      if (days >= 7) { weeks += Math.floor(days / 7); days = days % 7; }
    }
    return weeks > 0 ? `${weeks}w ${days}d ${hours}h ${minutes}m` : `${days}d ${hours}h ${minutes}m`;
  };

  const currentStatus = rt.status !== 'unknown' ? rt.status : server.status;

  const statusBadge = () => {
    if (currentStatus === 'online')  return <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">Online</span>;
    if (currentStatus === 'warning') return <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20">Atención</span>;
    return <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20">Offline</span>;
  };

  return (
    <button onClick={() => onClick(server)} className="text-left group w-full">
      <Card className="p-5 hover:bg-white/[0.05] transition relative">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl grad-brand-soft border border-white/10 flex items-center justify-center text-violet-200">
            {icons.monitor}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-lg">{server.name}</div>
              {statusBadge()}
              {rt.connected && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] animate-pulse" />
              )}
            </div>
            <div className="text-sm text-white/55 mt-0.5 font-mono">
              {server.ip} · {server.os}
            </div>
          </div>
          <span className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition">
            {icons.chevron}
          </span>
        </div>

        {/* Metric tiles row 1 */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          <Tile icon={icons.cpu}    label="CPU"   value={`${cpu.toFixed(1)}%`}    tone="emerald" />
          <Tile icon={icons.ram}    label="RAM"   value={`${memory.toFixed(1)}%`} tone="sky" />
          <Tile icon={icons.disk}   label="Disco" value={`${disk.toFixed(1)}%`}   tone="violet" />
        </div>

        {/* Metric tiles row 2 */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <Tile icon={icons.wrench}   label="Servicios" value={servicesCount}   tone="fuchsia" />
          <Tile icon={icons.globe}    label="Sitios"    value={websitesCount}   tone="emerald" />
          <Tile icon={icons.database} label="BBDD"      value={databasesCount}  tone="amber" />
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.06] mt-5 pt-4 flex items-center justify-between text-sm">
          <span className="text-white/55">
            Servicios clave: <span className="text-white/40">Sin datos</span>
          </span>
          <div className="flex items-center gap-2 text-white/55">
            {icons.clock}
            <span className="text-xs">Tiempo activo</span>
            <span className="font-mono text-xs text-white/75">{formatUptime(uptime)}</span>
          </div>
        </div>
      </Card>
    </button>
  );
};

/* ── Dashboard ────────────────────────────────────────────────────── */
export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<ServerData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: servers = [], isLoading, isError } = useServers();
  const refreshMutation = useRefreshAllServers();

  const transformServer = (s: Server): ServerData => ({
    id: s.id, name: s.name,
    status: s.status === 'online' ? 'online' : s.status === 'error' ? 'offline' : 'warning',
    cpu: s.metadata?.cpu ?? 0, memory: s.metadata?.memory ?? 0, disk: s.metadata?.disk ?? 0,
    uptime: s.metadata?.uptime ?? 'N/A', activeServices: s.metadata?.activeServices ?? 0,
    location: 'N/A', ip: s.host, os: s.os, services: [], websites: [], databases: [],
  });

  const filteredServers = useMemo(
    () => servers.filter(s =>
      !searchTerm ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.host.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [servers, searchTerm]
  );

  const onlineCount  = servers.filter(s => s.status === 'online').length;
  const time = now.toLocaleTimeString('es-CO', { hour12: false });

  if (selectedServer) {
    return <ServerDetail server={selectedServer} onBack={() => setSelectedServer(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <Card className="px-6 py-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl grad-brand flex items-center justify-center shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)]">
          <span className="text-white">{icons.server}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Panel de Control</h1>
          <p className="text-sm text-white/55 mt-0.5">Administración de Servidores y Servicios</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Hora actual</div>
            <div className="font-mono text-base text-white/95 tabular-nums">{time}</div>
          </div>
          <button className="w-11 h-11 rounded-xl glass-soft text-white/75 hover:text-white hover:bg-white/[0.06] flex items-center justify-center relative transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 004 0" />
            </svg>
            <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-pink-400 ring-2 ring-[#150a2e]" />
          </button>
        </div>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <Kpi label="Servidores Online" value={`${onlineCount}/${servers.length}`}
          accent="text-emerald-300" tone="emerald"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-emerald-300"><circle cx="12" cy="12" r="9" /><path d="M8 12l2.5 2.5L16 9.5" /></svg>} />
        <Kpi label="Servicios Activos" value="0/0"
          accent="text-sky-300" tone="sky"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-sky-300"><path d="M21 7.5l-9-4.5-9 4.5v9l9 4.5 9-4.5v-9z M3 7.5L12 12l9-4.5M12 12v9" /></svg>} />
        <Kpi label="Sitios Web" value="—"
          accent="text-violet-300" tone="violet"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-violet-300"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>} />
        <Kpi label="Bases de Datos" value="—"
          accent="text-amber-300" tone="amber"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-amber-300"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>} />
      </div>

      {/* Search + filters */}
      <Card className="p-3 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 px-3">
          {icons.search}
          <input
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/40 py-2.5 text-white/90"
            placeholder="Buscar servidores por nombre o IP…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07] text-sm font-medium transition">
          {icons.filter} Filtros
        </button>
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)] hover:shadow-[0_12px_30px_-8px_rgba(236,72,153,0.55)] text-sm font-medium transition disabled:opacity-60"
        >
          {icons.refresh} Actualizar
        </button>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card className="p-8 text-center">
          <p className="text-white/55">Error al cargar los servidores</p>
        </Card>
      )}

      {/* Server grid */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {filteredServers.map(server => (
            <GlassServerCard
              key={server.id}
              server={transformServer(server)}
              onClick={setSelectedServer}
            />
          ))}

          {/* Add new server tile */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="glass rounded-2xl transition group flex items-center justify-center min-h-[280px] grain relative cursor-pointer"
            style={{ border: '1.5px dashed rgba(255,255,255,0.18)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)')}
          >
            <div className="flex flex-col items-center gap-3 text-white/40 group-hover:text-white/70 transition">
              <div className="w-14 h-14 rounded-2xl grad-brand-soft border border-white/10 flex items-center justify-center">
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

      {/* Add server modal */}
      <AddServerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => setIsAddModalOpen(false)}
      />
    </div>
  );
};
