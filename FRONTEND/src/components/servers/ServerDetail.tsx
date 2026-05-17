import React, { useState } from 'react';
import { type ServerData } from '@typings/DashboardTypes';
import { Modal } from '@components/common/Modal';

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
const FolderIcon   = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>;
const TerminalIcon = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
const NetworkIcon  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 011-1h12a1 1 0 011 1v3M12 8v5"/></svg>;
const ActivityIcon = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const CpuIcon      = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>;
const CodeIcon     = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
const ShieldIcon   = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>;
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
const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0">
    <span className="text-sm text-white/50">{label}</span>
    <span className="text-sm font-medium text-white font-mono">{value}</span>
  </div>
);

/* ── Service icon map ─────────────────────────────────────────────── */
const serviceIconMap: Record<string, React.ReactNode> = {
  nginx: <GlobeIcon />, apache: <GlobeIcon />,
  mysql: <DbIcon />, postgresql: <DbIcon />, redis: <DbIcon />, mongodb: <DbIcon />,
  wordpress: <CodeIcon />, nodejs: <TerminalIcon />, docker: <CubeIcon className="w-5 h-5" />,
};
const getServiceIcon = (type: string) => serviceIconMap[type] ?? <PackageIcon />;

/* ── Component ────────────────────────────────────────────────────── */
interface ServerDetailProps {
  server: ServerData;
  onBack: () => void;
}

const staticData = {
  system: { os: 'Ubuntu 22.04.3 LTS', kernel: '5.15.0-91-generic', hostname: 'cloud.startcode.com.co', uptime: '3 días, 7 horas' },
  cpu: { usage: 100, cores: 4, loadAverage: '0.50, 0.45, 0.40' },
  memory: { total: 8192, used: 3440, free: 4752, usagePercent: 42 },
  disk: [{ total: 100, used: 14, free: 86, usagePercent: 14, mountPoint: '/' }],
  network: { privateIp: '192.168.1.100', publicIp: '203.0.113.1', interface: 'eth0' },
  processes: { running: 145, zombie: 12, total: 157 },
};

const TABS = [
  { id: 'overview',   label: 'Resumen',        icon: ChartIcon },
  { id: 'services',   label: 'Servicios',       icon: PackageIcon },
  { id: 'websites',   label: 'Sitios Web',      icon: GlobeIcon },
  { id: 'databases',  label: 'Bases de Datos',  icon: DbIcon },
  { id: 'files',      label: 'Archivos',        icon: FolderIcon },
] as const;

export const ServerDetail: React.FC<ServerDetailProps> = ({ server, onBack }) => {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('overview');
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <div className="space-y-5">

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
            <button onClick={() => setInstallOpen(true)}
              className="flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
                shadow-[0_4px_14px_-4px_rgba(168,85,247,0.55)] hover:shadow-[0_8px_20px_-6px_rgba(236,72,153,0.55)] transition">
              <PlusIcon /> Instalar Servicio
            </button>
            <button className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-white/65 hover:text-white transition">
              <GearIcon />
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'CPU',     value: server.cpu,    gradient: barGradient(server.cpu) },
            { label: 'Memoria', value: server.memory, gradient: barGradient(server.memory) },
            { label: 'Disco',   value: server.disk,   gradient: barGradient(server.disk) },
          ].map(({ label, value, gradient }) => (
            <div key={label} className="glass-soft rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/55">{label}</span>
                <span className="text-xs font-mono font-semibold text-white">{value}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700`}
                  style={{ width: `${Math.min(100, value)}%` }} />
              </div>
            </div>
          ))}
          <div className="glass-soft rounded-xl p-3 flex flex-col justify-center">
            <span className="text-xs text-white/55 mb-1">Tiempo activo</span>
            <span className="text-sm font-mono font-semibold text-white truncate">{server.uptime}</span>
          </div>
        </div>
      </header>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl grain p-2 flex gap-1 flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-medium transition ${
              activeTab === id
                ? 'grad-brand text-white shadow-[0_4px_14px_-4px_rgba(168,85,247,0.6)]'
                : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
            }`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Overview ────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Sistema */}
          <div className="glass-soft rounded-2xl p-5 border border-white/[0.06]">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-4">
              <TerminalIcon className="w-4 h-4 text-violet-300" /> Información del Sistema
            </h3>
            <div className="space-y-0.5">
              <InfoRow label="Sistema Operativo" value={staticData.system.os} />
              <InfoRow label="Kernel"            value={staticData.system.kernel} />
              <InfoRow label="Hostname"          value={staticData.system.hostname} />
              <InfoRow label="Load Average"      value={staticData.cpu.loadAverage} />
            </div>
          </div>

          {/* Red */}
          <div className="glass-soft rounded-2xl p-5 border border-white/[0.06]">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-4">
              <NetworkIcon className="w-4 h-4 text-violet-300" /> Red
            </h3>
            <div className="space-y-0.5">
              <InfoRow label="IP Privada" value={staticData.network.privateIp} />
              <InfoRow label="IP Pública"  value={staticData.network.publicIp} />
              <InfoRow label="Interfaz"    value={staticData.network.interface} />
            </div>
          </div>

          {/* Procesos */}
          <div className="glass-soft rounded-2xl p-5 border border-white/[0.06]">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-4">
              <ActivityIcon className="w-4 h-4 text-violet-300" /> Procesos
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'En ejecución', value: staticData.processes.running, color: 'text-emerald-300' },
                { label: 'Zombies',      value: staticData.processes.zombie,  color: 'text-rose-300' },
                { label: 'Total',        value: staticData.processes.total,   color: 'text-white' },
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
              <MetricBar label="CPU"         value={staticData.cpu.usage} />
              <MetricBar label="Memoria RAM" value={staticData.memory.usagePercent} />
              <MetricBar label={`Disco (${staticData.disk[0].mountPoint})`} value={staticData.disk[0].usagePercent} />
            </div>
          </div>
        </div>
      )}

      {/* ── Services ────────────────────────────────────────────────── */}
      {activeTab === 'services' && (
        <div className="glass rounded-2xl grain p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">Servicios Instalados</h2>
            <button onClick={() => setInstallOpen(true)}
              className="flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
                shadow-[0_4px_14px_-4px_rgba(168,85,247,0.55)] transition">
              <PlusIcon /> Nuevo Servicio
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {server.services.map(service => (
              <div key={service.id} className="glass-soft rounded-xl p-4 hover:bg-white/[0.05] transition border border-white/[0.05]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg glass flex items-center justify-center text-white/70">
                      {getServiceIcon(service.type)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{service.name}</p>
                      <p className="text-xs text-white/45">v{service.version} · Puerto {service.port}</p>
                    </div>
                  </div>
                  {statusIcon(service.status)}
                </div>

                <div className="space-y-2.5 mb-3">
                  <MetricBar label="CPU"     value={service.cpu} />
                  <MetricBar label="Memoria" value={service.memory} />
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/20 text-emerald-300 hover:bg-emerald-500/25 text-xs font-medium transition">
                    <PlayIcon /> Iniciar
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-rose-500/15 border border-rose-400/20 text-rose-300 hover:bg-rose-500/25 text-xs font-medium transition">
                    <PauseIcon /> Parar
                  </button>
                  <button className="w-8 h-8 rounded-lg glass-soft flex items-center justify-center text-white/55 hover:text-white transition">
                    <GearIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Websites ────────────────────────────────────────────────── */}
      {activeTab === 'websites' && (
        <div className="glass rounded-2xl grain p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">Sitios Web</h2>
            <button className="flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
              shadow-[0_4px_14px_-4px_rgba(168,85,247,0.55)] transition">
              <PlusIcon /> Nuevo Sitio
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {server.websites.map(website => (
              <div key={website.id} className="glass-soft rounded-xl p-4 border border-white/[0.05]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg glass flex items-center justify-center text-white/70">
                      <GlobeIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{website.domain}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/45 capitalize">{website.type}</span>
                        {website.ssl && <ShieldIcon className="w-3.5 h-3.5 text-emerald-300" />}
                      </div>
                    </div>
                  </div>
                  {statusIcon(website.status)}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="glass rounded-xl p-3">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Visitas</p>
                    <p className="text-lg font-semibold text-white">{website.visits.toLocaleString()}</p>
                  </div>
                  <div className="glass rounded-xl p-3">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Almacenamiento</p>
                    <p className="text-lg font-semibold text-white">{website.storage} GB</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 h-8 rounded-lg glass-soft text-white/75 hover:text-white hover:bg-white/[0.07] text-xs font-medium transition">
                    Gestionar
                  </button>
                  <button className="flex-1 h-8 rounded-lg bg-sky-500/15 border border-sky-400/20 text-sky-300 hover:bg-sky-500/25 text-xs font-medium transition">
                    Visitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Databases ───────────────────────────────────────────────── */}
      {activeTab === 'databases' && (
        <div className="glass rounded-2xl grain p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">Bases de Datos</h2>
            <button className="flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
              shadow-[0_4px_14px_-4px_rgba(168,85,247,0.55)] transition">
              <PlusIcon /> Nueva Base de Datos
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {server.databases.map(database => (
              <div key={database.id} className="glass-soft rounded-xl p-4 border border-white/[0.05]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg glass flex items-center justify-center text-white/70">
                      <DbIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{database.name}</p>
                      <p className="text-xs text-white/45 uppercase">{database.type}</p>
                    </div>
                  </div>
                  {statusIcon(database.status)}
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: 'Tamaño',     value: `${database.size} MB` },
                    { label: 'Tablas',     value: `${database.tables}` },
                    { label: 'Conexiones', value: `${database.connections}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="glass rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{label}</p>
                      <p className="text-sm font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 h-8 rounded-lg glass-soft text-white/75 hover:text-white hover:bg-white/[0.07] text-xs font-medium transition">
                    Gestionar
                  </button>
                  <button className="flex-1 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/20 text-emerald-300 hover:bg-emerald-500/25 text-xs font-medium transition">
                    Backup
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Files placeholder ───────────────────────────────────────── */}
      {activeTab === 'files' && (
        <div className="glass rounded-2xl grain p-10 flex flex-col items-center justify-center text-center gap-3">
          <FolderIcon className="w-10 h-10 text-white/20" />
          <p className="text-sm text-white/40">Gestor de archivos próximamente</p>
        </div>
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
