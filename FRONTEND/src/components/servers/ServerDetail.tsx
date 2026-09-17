import React, { useState } from 'react';
import { type ServerData } from '@typings/DashboardTypes';
import { Modal } from '@components/common/Modal';
import { ServerTerminal } from '@components/servers/ServerTerminal';
import { SftpModal, SftpIcon } from '@components/servers/sftp';
import { AgentCard } from '@components/servers/AgentCard';
import { useServerDetail } from '@hooks/useServerDetail';
import { useServerMetrics } from '@contexts/RealtimeMetricsContext';
import { useServiceAction } from '@hooks/useServiceAction';
import { daysUntil, timeUntil } from '@utils/time';

/* ── Inline SVG icons ─────────────────────────────────────────────── */
const sp = { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.75, strokeLinecap:'round' as const, strokeLinejoin:'round' as const };
const ServerIcon   = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>;
const CheckCircle  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9.5"/></svg>;
const AlertTri     = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M12 4L2 20h20L12 4z"/><path d="M12 10v5M12 18v.01"/></svg>;
const XCircle      = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>;
const ChevronLeft  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M15 18l-6-6 6-6"/></svg>;
const PlusIcon     = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><path d="M12 5v14M5 12h14"/></svg>;
const GearIcon     = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
const ChartIcon    = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/></svg>;
const PackageIcon  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const GlobeIcon    = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;
const DbIcon       = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6"/></svg>;
const TerminalIcon = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
const NetworkIcon  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 011-1h12a1 1 0 011 1v3M12 8v5"/></svg>;
const ActivityIcon = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const CpuIcon      = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>;
const CodeIcon     = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
const PlayIcon     = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const PauseIcon    = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
const CubeIcon     = ({ className='w-8 h-8' }) => <svg {...sp} className={className}><path d="M21 7.5l-9-4.5-9 4.5v9l9 4.5 9-4.5v-9z"/><path d="M3 7.5L12 12l9-4.5M12 12v9"/></svg>;

/* ── Helpers ──────────────────────────────────────────────────────── */
const statusIcon = (status: string) => {
  if (['online','running','active','connected'].includes(status))
    return <CheckCircle className="w-5 h-5 text-emerald-400" />;
  if (['warning','maintenance'].includes(status))
    return <AlertTri className="w-5 h-5 text-amber-400" />;
  return <XCircle className="w-5 h-5 text-rose-400" />;
};

/** Ámbar cuando quedan menos de 15 días, rosa si ya caducó. */
const certTone = (expiry: string): 'default' | 'warn' | 'danger' => {
  const days = daysUntil(expiry);
  if (days === null) return 'default';
  if (days < 0) return 'danger';
  return days < 15 ? 'warn' : 'default';
};

const barGradient = (pct: number) => {
  if (pct >= 90) return 'from-rose-500 to-orange-500';
  if (pct >= 70) return 'from-amber-400 to-orange-500';
  if (pct >= 50) return 'from-sky-500 to-cyan-400';
  return 'from-emerald-500 to-teal-400';
};

/* ── Progress bar ─────────────────────────────────────────────────── */
const MetricBar = ({ label, value, suffix = '%' }: { label: string; value: number; suffix?: string }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-sm text-white/55">{label}</span>
      <span className="text-sm font-mono font-semibold text-white">{value}{suffix}</span>
    </div>
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${barGradient(value)}`}
        style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  </div>
);

/* ── Info row ─────────────────────────────────────────────────────── */
const toneClass = { default: 'text-white', warn: 'text-amber-300', danger: 'text-rose-300' } as const;

const InfoRow = ({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: keyof typeof toneClass;
}) => (
  <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
    <span className="text-sm text-white/50 shrink-0">{label}</span>
    {/* Un modelo de CPU o un kernel largo desbordaban la fila */}
    <span className={`text-sm font-medium font-mono truncate ${toneClass[tone]}`} title={value}>
      {value}
    </span>
  </div>
);

/* ── Service icon map ─────────────────────────────────────────────── */
const serviceIconMap: Record<string, React.ReactNode> = {
  nginx: <GlobeIcon />, apache: <GlobeIcon />,
  mysql: <DbIcon />, postgresql: <DbIcon />, redis: <DbIcon />, mongodb: <DbIcon />,
  wordpress: <CodeIcon />, nodejs: <TerminalIcon />, docker: <CubeIcon className="w-5 h-5" />,
};
const getServiceIcon = (type: string) => serviceIconMap[type] ?? <PackageIcon />;

/* ── Estado de una unidad systemd ─────────────────────────────────── */
const ServiceStateBadge = ({ state }: { state: string }) => {
  const tone =
    state === 'active'  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20' :
    state === 'failed'  ? 'bg-rose-500/15 text-rose-300 ring-rose-400/20' :
                          'bg-white/[0.06] text-white/50 ring-white/10';
  const label =
    state === 'active' ? 'Activo' : state === 'failed' ? 'Fallido' :
    state === 'inactive' ? 'Inactivo' : 'Desconocido';

  return (
    <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 shrink-0 ${tone}`}>
      {label}
    </span>
  );
};

/** systemd reporta la memoria de cada unidad en bytes. */
const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

/* ── Component ────────────────────────────────────────────────────── */
interface ServerDetailProps {
  server: ServerData;
  onBack: () => void;
}

const TABS = [
  { id: 'overview',   label: 'Resumen',        icon: ChartIcon },
  { id: 'services',   label: 'Servicios',       icon: PackageIcon },
  { id: 'websites',   label: 'Sitios Web',      icon: GlobeIcon },
  { id: 'databases',  label: 'Bases de Datos',  icon: DbIcon },
] as const;

export const ServerDetail: React.FC<ServerDetailProps> = ({ server, onBack }) => {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('overview');
  const [installOpen, setInstallOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [sftpOpen, setSftpOpen] = useState(false);

  /* Datos reales del agente. El WebSocket manda para cpu/memoria/disco por ser
     instantáneo; el resto (kernel, IPs, procesos, discos por montaje) solo llega
     por HTTP, que es lo que trae este hook. */
  const { data: detail, isLoading, isError } = useServerDetail(server.id);
  const rt = useServerMetrics(server.id);

  const live = {
    cpu: rt.metrics?.cpu ?? detail?.cpu.usage ?? server.cpu,
    memory: rt.metrics?.memory ?? detail?.memory.usagePercent ?? server.memory,
    disk: rt.metrics?.disk ?? detail?.disk?.[0]?.usagePercent ?? server.disk,
  };

  const uptime = detail?.system.uptime ?? server.uptime;
  const dash = '—';

  /* ── Servicios systemd ── */
  const serviceAction = useServiceAction(server.id);
  const [serviceFilter, setServiceFilter] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /* useMemo estabiliza la referencia: si no, la lista se recrea en cada render
     y el filtrado de abajo se recalcula siempre. */
  const services = React.useMemo(() => detail?.services.list ?? [], [detail]);
  const websites = detail?.websites.list ?? [];
  const databases = detail?.databases.list ?? [];

  const primaryIface = detail?.network.primary ?? null;
  const otherIfaces = (detail?.network.interfaces ?? []).filter(i => i.iface !== primaryIface?.iface);
  const activeServices = services.filter(s => s.state === 'active');
  const failedServices = services.filter(s => s.state === 'failed');

  /* Con ~160 unidades, pintarlas todas es ruido: primero las que fallan, luego
     las activas, y se corta la lista salvo que el usuario filtre. */
  const visibleServices = React.useMemo(() => {
    const term = serviceFilter.trim().toLowerCase();
    const weight = (state: string) => (state === 'failed' ? 0 : state === 'active' ? 1 : 2);

    return services
      .filter(s => (onlyActive ? s.state === 'active' : true))
      .filter(s =>
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.displayName ?? '').toLowerCase().includes(term),
      )
      .sort((a, b) => weight(a.state) - weight(b.state) || a.name.localeCompare(b.name))
      .slice(0, term ? 200 : 60);
  }, [services, serviceFilter, onlyActive]);

  const runServiceAction = (serviceName: string, action: 'start' | 'stop' | 'restart') => {
    setActionError(null);
    serviceAction.mutate(
      { serviceName, action },
      {
        onError: (err: unknown) => {
          const message =
            typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message?: unknown }).message)
              : 'No se pudo ejecutar la acción';
          setActionError(`${serviceName}: ${message}`);
        },
      },
    );
  };

  return (
    <div className="mo-view space-y-5">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="glass rounded-2xl grain p-5">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <button onClick={onBack}
              className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-white/65 hover:text-white hover:bg-white/[0.07] transition">
              <ChevronLeft />
            </button>
            <div className="w-12 h-12 rounded-xl grad-brand flex items-center justify-center shrink-0
              shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)]">
              <ServerIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{server.name}</h1>
              <p className="text-sm text-white/50">{server.ip} · {server.os}</p>
            </div>
            {statusIcon(server.status)}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setTerminalOpen(true)}
              title="Abrir una shell SSH en este servidor"
              className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07] text-sm font-medium">
              <TerminalIcon className="w-4 h-4" /> Abrir Terminal
            </button>
            <button onClick={() => setSftpOpen(true)}
              title="Subir archivos y carpetas por SFTP"
              className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07] text-sm font-medium">
              <SftpIcon className="w-4 h-4" /> SFTP
            </button>
            <button onClick={() => setInstallOpen(true)}
              className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
                shadow-[0_4px_14px_-4px_rgba(168,85,247,0.55)] hover:shadow-[0_8px_20px_-6px_rgba(236,72,153,0.55)]">
              <PlusIcon /> Instalar Servicio
            </button>
          </div>
        </div>

        {/* Agente de monitoreo: sin él, todo lo de abajo está vacío */}
        <div className="mb-3">
          <AgentCard serverId={server.id} serverName={server.name} />
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'CPU',     value: live.cpu,    gradient: barGradient(live.cpu) },
            { label: 'Memoria', value: live.memory, gradient: barGradient(live.memory) },
            { label: 'Disco',   value: live.disk,   gradient: barGradient(live.disk) },
          ].map(({ label, value, gradient }) => (
            <div key={label} className="glass-soft rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/55">{label}</span>
                <span className="text-xs font-mono font-semibold text-white tabular-nums">{value.toFixed(1)}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700`}
                  style={{ width: `${Math.min(100, value)}%` }} />
              </div>
            </div>
          ))}
          <div className="glass-soft rounded-xl p-3 flex flex-col justify-center">
            <span className="text-xs text-white/55 mb-1">Tiempo activo</span>
            <span className="text-sm font-mono font-semibold text-white truncate">{uptime}</span>
          </div>
        </div>
      </header>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl grain p-2 flex gap-1 flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`mo-tab flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-medium ${
              activeTab === id
                ? 'mo-tab-on grad-brand text-white shadow-[0_4px_14px_-4px_rgba(168,85,247,0.6)]'
                : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
            }`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Overview ────────────────────────────────────────────────── */}
      {activeTab === 'overview' && !isLoading && (isError || !detail) && (
        <div className="mo-panel glass-soft rounded-2xl p-5 border border-amber-400/20 flex items-center gap-3">
          <ActivityIcon className="w-5 h-5 text-amber-300 shrink-0" />
          <p className="text-sm text-white/70">
            Sin datos del agente para este servidor. Los valores del resumen aparecerán
            en cuanto el agente de monitoreo reporte.
          </p>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="mo-panel grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Sistema */}
          <div className="glass-soft rounded-2xl p-5 border border-white/[0.06]">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-4">
              <TerminalIcon className="w-4 h-4 text-violet-300" /> Información del Sistema
            </h3>

            {/* El procesador no cabe en una fila etiqueta/valor */}
            {detail?.cpu.brand && (
              <div className="glass rounded-xl p-3 mb-3 flex items-start gap-3">
                <CpuIcon className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm text-white truncate" title={detail.cpu.brand}>{detail.cpu.brand}</p>
                  <p className="text-xs text-white/45 font-mono truncate">
                    {[
                      detail.cpu.manufacturer,
                      detail.cpu.physicalCores
                        ? `${detail.cpu.cores} lógicos / ${detail.cpu.physicalCores} físicos`
                        : `${detail.cpu.cores} núcleos`,
                      detail.system.arch,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-0.5">
              <InfoRow label="Sistema Operativo" value={detail?.system.os ?? dash} />
              <InfoRow label="Kernel"            value={detail?.system.kernel ?? dash} />
              <InfoRow label="Hostname"          value={detail?.system.hostname ?? dash} />
              <InfoRow label="Load Average"      value={detail?.cpu.loadAverage ?? dash} />
              {!detail?.cpu.brand && (
                <InfoRow label="Núcleos" value={detail ? String(detail.cpu.cores) : dash} />
              )}
            </div>
          </div>

          {/* Red */}
          <div className="glass-soft rounded-2xl p-5 border border-white/[0.06]">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-4">
              <NetworkIcon className="w-4 h-4 text-violet-300" /> Red
            </h3>
            <div className="space-y-0.5">
              {/* Sin interfaces del agente no se inventa ninguna: antes decía
                  siempre "eth0", viniera lo que viniera del servidor. */}
              {primaryIface && (
                <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/[0.05]">
                  <span className="text-sm text-white/50 shrink-0">Interfaz</span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-white font-mono truncate">{primaryIface.iface}</span>
                    <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 shrink-0 ${
                      primaryIface.operstate === 'up'
                        ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20'
                        : 'bg-white/[0.06] text-white/50 ring-white/10'
                    }`}>
                      {primaryIface.operstate || 'desconocido'}
                    </span>
                  </span>
                </div>
              )}
              <InfoRow label="IP Privada" value={detail?.network.privateIp ?? dash} />
              <InfoRow label="IP Pública"  value={detail?.network.publicIp ?? dash} />
              {primaryIface?.mac && <InfoRow label="MAC" value={primaryIface.mac} />}
              {primaryIface && (
                <InfoRow
                  label="Tráfico"
                  value={`↓ ${formatBytes(primaryIface.rxBytes)} · ↑ ${formatBytes(primaryIface.txBytes)}`}
                />
              )}
              <InfoRow label="Host"        value={server.ip} />
            </div>

            {otherIfaces.length > 0 && (
              <div className="mt-3 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">Otras interfaces</h4>
                {otherIfaces.map(iface => (
                  <div key={iface.iface} className="glass rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-white/75 truncate">{iface.iface}</span>
                    <span className="text-xs font-mono text-white/45 truncate">{iface.ip4 || iface.ip6 || '—'}</span>
                    <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 shrink-0 ${
                      iface.operstate === 'up'
                        ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20'
                        : 'bg-white/[0.06] text-white/50 ring-white/10'
                    }`}>
                      {iface.operstate || '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Procesos */}
          <div className="glass-soft rounded-2xl p-5 border border-white/[0.06]">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-4">
              <ActivityIcon className="w-4 h-4 text-violet-300" /> Procesos
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'En ejecución', value: detail?.processes.running ?? 0, color: 'text-emerald-300' },
                { label: 'Zombies',      value: detail?.processes.zombie  ?? 0, color: 'text-rose-300' },
                { label: 'Total',        value: detail?.processes.total   ?? 0, color: 'text-white' },
              ].map(({ label, value, color }) => (
                <div key={label} className="glass rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${color} mb-1`}>{value}</p>
                  <p className="text-[10px] text-white/45 uppercase tracking-wider">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recursos detallados */}
          <div className="glass-soft rounded-2xl p-5 border border-white/[0.06]">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-4">
              <CpuIcon className="w-4 h-4 text-violet-300" /> Recursos Detallados
            </h3>
            <div className="space-y-4">
              <MetricBar label="CPU" value={live.cpu} />
              <MetricBar
                label={
                  detail
                    ? `Memoria RAM (${Math.round(detail.memory.used / 1024)} / ${Math.round(detail.memory.total / 1024)} GB)`
                    : 'Memoria RAM'
                }
                value={live.memory}
              />
              {(detail?.disk ?? []).map(fs => (
                <MetricBar
                  key={fs.mountPoint}
                  label={`Disco ${fs.mountPoint} (${fs.used.toFixed(1)} / ${fs.total.toFixed(1)} GB)`}
                  value={fs.usagePercent}
                />
              ))}
              {!detail && <MetricBar label="Disco" value={live.disk} />}
            </div>
          </div>
        </div>
      )}

      {/* ── Services ────────────────────────────────────────────────── */}
      {activeTab === 'services' && (
        <div className="mo-panel glass rounded-2xl grain p-5">
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-white">Servicios systemd</h2>
              <p className="text-xs text-white/45 mt-0.5">
                {services.length > 0
                  ? `${activeServices.length} activos · ${failedServices.length} fallidos · ${services.length} en total`
                  : 'Sin inventario del agente'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="glass-input rounded-xl h-9 flex items-center px-3 gap-2">
                <input
                  value={serviceFilter}
                  onChange={e => setServiceFilter(e.target.value)}
                  placeholder="Filtrar servicios…"
                  className="bg-transparent outline-none text-sm text-white/90 placeholder:text-white/30 w-44"
                />
              </div>
              <button
                onClick={() => setOnlyActive(v => !v)}
                className={`mo-tab h-9 px-3.5 rounded-xl text-xs font-medium border
                  ${onlyActive
                    ? 'mo-tab-on grad-brand-soft text-white border-white/10'
                    : 'glass-soft text-white/60 hover:text-white border-transparent'}`}
              >
                Solo activos
              </button>
              <button onClick={() => setInstallOpen(true)}
                className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
                  shadow-[0_4px_14px_-4px_rgba(168,85,247,0.55)]">
                <PlusIcon /> Nuevo Servicio
              </button>
            </div>
          </div>

          {actionError && (
            <div className="glass-soft rounded-xl p-3 mb-4 text-sm text-rose-300 border border-rose-400/20">
              {actionError}
            </div>
          )}

          {services.length === 0 ? (
            <div className="rounded-xl py-10 text-center" style={{ border: '1.5px dashed var(--hairline-strong)' }}>
              <p className="text-sm text-white/55">Sin servicios reportados</p>
              <p className="text-xs text-white/35 mt-1">
                El agente envía el inventario de systemd cada pocos minutos.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleServices.map(service => {
                const busy =
                  serviceAction.isPending && serviceAction.variables?.serviceName === service.name;

                return (
                  <div key={service.name}
                    className="glass-soft rounded-xl p-4 border border-white/[0.05] hover:bg-white/[0.05] transition">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg glass flex items-center justify-center text-white/70 shrink-0">
                          {getServiceIcon(service.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate" title={service.name}>
                            {service.name}
                          </p>
                          <p className="text-xs text-white/45 truncate" title={service.displayName}>
                            {service.displayName || service.subState}
                          </p>
                        </div>
                      </div>
                      <ServiceStateBadge state={service.state} />
                    </div>

                    <div className="flex items-center gap-3 text-xs text-white/45 mb-3 flex-wrap">
                      <span>{service.enabled ? 'Habilitado al arranque' : 'No habilitado'}</span>
                      {service.pid && <span className="font-mono">PID {service.pid}</span>}
                      {service.memory > 0 && (
                        <span className="font-mono tabular-nums">{formatBytes(service.memory)}</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => runServiceAction(service.name, 'start')}
                        disabled={busy || service.state === 'active'}
                        className="mo-tab flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/20 text-emerald-300 hover:bg-emerald-500/25 text-xs font-medium disabled:opacity-40"
                      >
                        <PlayIcon /> Iniciar
                      </button>
                      <button
                        onClick={() => runServiceAction(service.name, 'stop')}
                        disabled={busy || service.state !== 'active'}
                        className="mo-tab flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-rose-500/15 border border-rose-400/20 text-rose-300 hover:bg-rose-500/25 text-xs font-medium disabled:opacity-40"
                      >
                        <PauseIcon /> Parar
                      </button>
                      <button
                        onClick={() => runServiceAction(service.name, 'restart')}
                        disabled={busy}
                        title="Reiniciar"
                        className="mo-tab w-8 h-8 rounded-lg glass-soft flex items-center justify-center text-white/55 hover:text-white disabled:opacity-40"
                      >
                        <GearIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {services.length > visibleServices.length && (
            <p className="text-xs text-white/35 mt-4 text-center">
              Mostrando {visibleServices.length} de {services.length}. Afina el filtro para ver el resto.
            </p>
          )}
        </div>
      )}

      {/* ── Websites ────────────────────────────────────────────────── */}
      {activeTab === 'websites' && (
        <div className="mo-panel glass rounded-2xl grain p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-white">Sitios Web</h2>
              <p className="text-xs text-white/45 mt-0.5">
                {websites.length > 0 ? `${websites.length} detectados` : 'Sin inventario del agente'}
              </p>
            </div>
            <button className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
              shadow-[0_4px_14px_-4px_rgba(168,85,247,0.55)]">
              <PlusIcon /> Nuevo Sitio
            </button>
          </div>

          {websites.length === 0 ? (
            <div className="rounded-xl py-10 text-center" style={{ border: '1.5px dashed var(--hairline-strong)' }}>
              <p className="text-sm text-white/55">No se detectaron sitios web</p>
              <p className="text-xs text-white/35 mt-1">
                El agente busca virtual hosts de nginx y Apache; si no hay ninguno configurado, esta lista queda vacía.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {websites.map(site => (
                <div key={site.domain} className="glass-soft rounded-xl p-4 border border-white/[0.05]">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg glass flex items-center justify-center text-white/70 shrink-0">
                        <GlobeIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{site.domain}</p>
                        <p className="text-xs text-white/45 truncate">
                          {site.server ?? 'servidor web'}{site.port ? ` · puerto ${site.port}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 shrink-0
                      ${site.ssl
                        ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20'
                        : 'bg-amber-500/15 text-amber-300 ring-amber-400/20'}`}>
                      {site.ssl ? 'SSL' : 'Sin SSL'}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {site.path && <InfoRow label="Raíz" value={site.path} />}
                    {site.certExpiry && (
                      <InfoRow
                        label="Certificado"
                        value={timeUntil(site.certExpiry)}
                        tone={certTone(site.certExpiry)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Databases ───────────────────────────────────────────────── */}
      {activeTab === 'databases' && (
        <div className="mo-panel glass rounded-2xl grain p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-white">Bases de Datos</h2>
              <p className="text-xs text-white/45 mt-0.5">
                {databases.length > 0 ? `${databases.length} motores detectados` : 'Sin inventario del agente'}
              </p>
            </div>
            <button className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
              shadow-[0_4px_14px_-4px_rgba(168,85,247,0.55)]">
              <PlusIcon /> Nueva Base
            </button>
          </div>

          {databases.length === 0 ? (
            <div className="rounded-xl py-10 text-center" style={{ border: '1.5px dashed var(--hairline-strong)' }}>
              <p className="text-sm text-white/55">No se detectaron motores de base de datos</p>
              <p className="text-xs text-white/35 mt-1">
                El agente reconoce MySQL/MariaDB, PostgreSQL, MongoDB y Redis instalados en el sistema.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {databases.map(db => (
                <div key={db.type} className="glass-soft rounded-xl p-4 border border-white/[0.05]">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg glass flex items-center justify-center text-white/70 shrink-0">
                        <DbIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{db.type}</p>
                        <p className="text-xs text-white/45 truncate">
                          {db.version ? `v${db.version}` : 'versión desconocida'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 shrink-0
                      ${db.running
                        ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20'
                        : 'bg-white/[0.06] text-white/50 ring-white/10'}`}>
                      {db.running ? 'En ejecución' : 'Detenido'}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {/* Ausente no es cero: si el agente no pudo medirlo, se dice. */}
                    <InfoRow
                      label="Tamaño"
                      value={db.sizeBytes !== undefined ? formatBytes(db.sizeBytes) : dash}
                    />
                    <InfoRow
                      label="Bases"
                      value={db.databases ? String(db.databases.length) : 'sin acceso'}
                    />
                  </div>

                  {(db.databases?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {db.databases!.slice(0, 8).map(name => (
                        <span key={name} className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-white/60">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Terminal SSH ─────────────────────────────────────────────── */}
      {terminalOpen && (
        <ServerTerminal
          serverId={server.id}
          serverName={server.name}
          onClose={() => setTerminalOpen(false)}
        />
      )}

      {/* ── SFTP ─────────────────────────────────────────────────────── */}
      {sftpOpen && (
        <SftpModal
          serverId={server.id}
          serverName={server.name}
          isOpen
          onClose={() => setSftpOpen(false)}
        />
      )}

      {/* ── Install Modal ────────────────────────────────────────────── */}
      <Modal isOpen={installOpen} onClose={() => setInstallOpen(false)} title="Instalar Nuevo Servicio" size="md">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { name: 'Nginx',      type: 'nginx',      icon: <GlobeIcon />,   desc: 'Servidor web y proxy' },
            { name: 'Apache',     type: 'apache',     icon: <GlobeIcon />,   desc: 'Servidor web HTTP' },
            { name: 'MySQL',      type: 'mysql',      icon: <DbIcon />,      desc: 'Base de datos relacional' },
            { name: 'PostgreSQL', type: 'postgresql', icon: <DbIcon />,      desc: 'Base de datos avanzada' },
            { name: 'Redis',      type: 'redis',      icon: <DbIcon />,      desc: 'Cache en memoria' },
            { name: 'MongoDB',    type: 'mongodb',    icon: <DbIcon />,      desc: 'Base de datos NoSQL' },
            { name: 'WordPress',  type: 'wordpress',  icon: <CodeIcon />,    desc: 'CMS popular' },
            { name: 'Node.js',    type: 'nodejs',     icon: <TerminalIcon />,desc: 'Runtime JavaScript' },
            { name: 'Docker',     type: 'docker',     icon: <CubeIcon className="w-5 h-5" />, desc: 'Contenedores' },
          ].map(({ name, type, icon, desc }) => (
            <button key={type}
              className="p-4 rounded-xl glass-soft hover:bg-white/[0.07] transition text-left border border-white/[0.05] hover:border-violet-400/25">
              <div className="w-8 h-8 text-white/60 mb-2">{icon}</div>
              <p className="text-sm font-semibold text-white mb-0.5">{name}</p>
              <p className="text-xs text-white/45">{desc}</p>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
};
