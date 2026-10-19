import React, { Suspense, lazy, useRef, useState } from 'react';
import { type ServerData } from '@typings/DashboardTypes';
import { SftpIcon } from '@components/servers/sftp/icons';
import { AgentCard } from '@components/servers/AgentCard';
import { CommandBar, type CommandBarHandle } from '@components/servers/CommandBar';
import { useServerDetail, type TopProcess } from '@hooks/useServerDetail';
import { useServerMetrics } from '@hooks/useRealtimeMetrics';
import { useServiceAction, usePinnedServices, useKillProcess } from '@hooks/useServiceAction';
import { ServiceActionModal } from '@components/servers/ServiceActionModal';
import { ProcessKillModal } from '@components/servers/ProcessKillModal';

import { ServiceLogsModal } from '@components/servers/ServiceLogsModal';
import { ServiceCard } from '@components/servers/ServiceCard';
import { unitName } from '@utils/services';
import { InstallServiceModal } from '@components/servers/InstallServiceModal';
import { notify } from '@services/notification.service';
import type { ServiceAction } from '@services/service-control.service';
import { MetricBar } from '@components/common/MetricBar';
import { barGradient, formatBytes, groupDisks } from '@utils/metrics';
import { formatUptime } from '@utils/time';
import { useTerminalDock, useTerminalDockViewing } from '@hooks/useTerminalDock';

/* ── Inline SVG icons ─────────────────────────────────────────────── */
const sp = { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.75, strokeLinecap:'round' as const, strokeLinejoin:'round' as const };
const ServerIcon   = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>;
const CheckCircle  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9.5"/></svg>;
const AlertTri     = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M12 4L2 20h20L12 4z"/><path d="M12 10v5M12 18v.01"/></svg>;
const XCircle      = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>;
const ChevronLeft  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M15 18l-6-6 6-6"/></svg>;
const PlusIcon     = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><path d="M12 5v14M5 12h14"/></svg>;
const ChartIcon    = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/></svg>;
const PackageIcon  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const TerminalIcon = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
const NetworkIcon  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 011-1h12a1 1 0 011 1v3M12 8v5"/></svg>;
const ActivityIcon = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const CloseIcon    = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><path d="M18 6L6 18M6 6l12 12"/></svg>;
const MemoryIcon   = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M6 11v2M10 11v2M14 11v2M18 11v2M6 17v3M18 17v3"/></svg>;
const CpuIcon      = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>;
const CodeIcon     = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
const HelmIcon     = ({ className='w-8 h-8' }) => <svg {...sp} className={className}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>;
const CubeIcon     = ({ className='w-8 h-8' }) => <svg {...sp} className={className}><path d="M21 7.5l-9-4.5-9 4.5v9l9 4.5 9-4.5v-9z"/><path d="M3 7.5L12 12l9-4.5M12 12v9"/></svg>;

/* ── Helpers ──────────────────────────────────────────────────────── */
/* Nombre legible de un proceso. El nombre corto (comm) lo puede fijar el propio
   programa ("MainThread") y entonces no dice qué es: se deriva del comando,
   y para intérpretes se añade el script ("python3 worker.py"). */
const INTERPRETERS = /^(python[\d.]*|node|java|php[\d.]*|ruby|perl|bash|sh|dotnet)$/;
const baseName = (path: string) => path.split('/').pop() ?? path;

const processLabel = (proc: TopProcess): string => {
  const [exe = '', ...args] = proc.command.trim().split(/\s+/);
  const bin = baseName(exe);
  if (!bin || (proc.name && bin.startsWith(proc.name))) return proc.name || bin || `PID ${proc.pid}`;
  if (INTERPRETERS.test(bin)) {
    const script = args.find(a => !a.startsWith('-'));
    if (script) return `${bin} ${baseName(script)}`;
  }
  return bin;
};

const statusIcon = (status: string) => {
  if (['online','running','active','connected'].includes(status))
    return <CheckCircle className="w-5 h-5 text-emerald-400" />;
  if (['warning','maintenance'].includes(status))
    return <AlertTri className="w-5 h-5 text-amber-400" />;
  return <XCircle className="w-5 h-5 text-rose-400" />;
};

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
  <div className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-0">
    <span className="text-sm text-white/50 shrink-0">{label}</span>
    {/* Un modelo de CPU o un kernel largo desbordaban la fila */}
    <span className={`text-sm font-medium font-mono truncate ${toneClass[tone]}`} title={value}>
      {value}
    </span>
  </div>
);

/** Cómo se cuenta la acción ya ejecutada en el aviso. */
const ACTION_PAST: Record<ServiceAction, string> = {
  start: 'iniciado',
  stop: 'detenido',
  restart: 'reiniciado',
  enable: 'habilitado al arranque',
  disable: 'quitado del arranque',
};

/* ── Component ────────────────────────────────────────────────────── */
interface ServerDetailProps {
  server: ServerData;
  onBack: () => void;
}

/* Bajo demanda: el cliente SFTP, Docker y Kubernetes solo se descargan al abrirlos,
   no con el detalle. La terminal (xterm) la carga `TerminalDockProvider`. */
const SftpModal = lazy(() =>
  import('@components/servers/sftp/SftpModal').then(m => ({ default: m.SftpModal })));
const DockerTab = lazy(() =>
  import('@components/servers/DockerTab').then(m => ({ default: m.DockerTab })));
const KubernetesTab = lazy(() =>
  import('@components/servers/KubernetesTab').then(m => ({ default: m.KubernetesTab })));
const CommandsTab = lazy(() =>
  import('@components/servers/CommandsTab').then(m => ({ default: m.CommandsTab })));

const TABS = [
  { id: 'overview',   label: 'Resumen',        icon: ChartIcon },
  { id: 'services',   label: 'Servicios',       icon: PackageIcon },
  { id: 'commands',   label: 'Comandos',        icon: CodeIcon },
  { id: 'docker',     label: 'Docker',          icon: CubeIcon },
  { id: 'kubernetes', label: 'Kubernetes',      icon: HelmIcon },
] as const;

/* Unidades de systemd que delatan un nodo de Kubernetes, de la distribución más
   concreta a la genérica: la primera que aparezca en el inventario manda. */
const KUBERNETES_UNITS = [
  'k3s', 'k3s-agent', 'snap.microk8s.daemon-kubelite', 'snap.microk8s.daemon-kubelet',
  'rke2-server', 'rke2-agent', 'k0scontroller', 'k0sworker', 'kubelet',
];

export const ServerDetail: React.FC<ServerDetailProps> = ({ server, onBack }) => {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('overview');
  const [installOpen, setInstallOpen] = useState(false);
  /* La terminal es global: al salir de este detalle se minimiza abajo y sus
     sesiones siguen. Entrar aquí con la de otro servidor abierta la cierra. */
  const terminal = useTerminalDock();
  useTerminalDockViewing(server.id);
  const terminalSession = terminal.session?.serverId === server.id;
  const [sftpOpen, setSftpOpen] = useState(false);
  const commandBarRef = useRef<CommandBarHandle>(null);

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

  /* Los cerrados se ocultan ya: el top no se refresca hasta el siguiente
     inventario del agente. */
  const [killedPids, setKilledPids] = useState<Set<number>>(() => new Set());
  const topMemory = [...(detail?.processes.topList ?? [])]
    .filter(p => !killedPids.has(p.pid))
    .sort((a, b) => b.memRss - a.memRss)
    .slice(0, 5);

  /* Misma fuente y formato que la tarjeta: el tiempo real del socket primero. */
  const uptime = formatUptime(
    rt.metrics?.uptime ?? detail?.system.uptimeSeconds ?? (Number(server.uptime) || null),
  );
  const dash = '—';

  /* ── Servicios systemd ── */
  const serviceAction = useServiceAction(server.id);
  const setPinned = usePinnedServices(server.id);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /* useMemo estabiliza la referencia: si no, la lista se recrea en cada render
     y el filtrado de abajo se recalcula siempre. */
  const services = React.useMemo(() => detail?.services.list ?? [], [detail]);
  /* El tab Docker solo aparece si el inventario trae la unidad docker.service. */
  const dockerUnit = services.find(s => unitName(s.name) === 'docker');
  /* El tab Kubernetes, si el inventario trae una unidad de k3s, microk8s, rke2, k0s o kubelet. */
  const kubeUnit = KUBERNETES_UNITS.map(u => services.find(s => unitName(s.name) === u)).find(Boolean);
  const visibleTabs = TABS.filter(t => (t.id !== 'docker' || dockerUnit) && (t.id !== 'kubernetes' || kubeUnit));

  const primaryIface = detail?.network.primary ?? null;
  const otherIfaces = (detail?.network.interfaces ?? []).filter(i => i.iface !== primaryIface?.iface);
  const activeServices = services.filter(s => s.state === 'active');
  const failedServices = services.filter(s => s.state === 'failed');

  /* Los que el usuario fijó para este servidor. Un servidor reporta ~160
     unidades y casi ninguna importa: esta lista es la que decide qué se ve. */
  const pinned = React.useMemo(() => detail?.services.pinned ?? [], [detail]);
  const pinnedSet = React.useMemo(
    () => new Set(pinned.map(unitName)),
    [pinned],
  );

  const pinnedServices = React.useMemo(() => {
    const term = serviceFilter.trim().toLowerCase();

    return services
      .filter(s => pinnedSet.has(unitName(s.name)))
      /* Con un filtro escrito, lo fijado tampoco se libra: si no, la búsqueda
         devolvería resultados que no coinciden con lo buscado. */
      .filter(s =>
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.displayName ?? '').toLowerCase().includes(term),
      )
      .sort((a, b) => pinned.indexOf(a.name) - pinned.indexOf(b.name));
  }, [services, pinnedSet, pinned, serviceFilter]);

  /* Con ~160 unidades, pintarlas todas es ruido: primero las que fallan, luego
     las activas, y se corta la lista salvo que el usuario filtre. Lo fijado ya
     tiene su propia sección arriba y no se repite aquí. */
  const visibleServices = React.useMemo(() => {
    const term = serviceFilter.trim().toLowerCase();
    const weight = (state: string) => (state === 'failed' ? 0 : state === 'active' ? 1 : 2);

    return services
      .filter(s => !pinnedSet.has(unitName(s.name)))
      .filter(s => (onlyActive ? s.state === 'active' : true))
      .filter(s =>
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.displayName ?? '').toLowerCase().includes(term),
      )
      .sort((a, b) => weight(a.state) - weight(b.state) || a.name.localeCompare(b.name))
      .slice(0, term ? 200 : 60);
  }, [services, serviceFilter, onlyActive, pinnedSet]);

  /* Una acción bloquea solo su tarjeta, y el spinner va en el botón que la
     lanzó, no en los cuatro. */
  const cardBusy = (serviceName: string) =>
    serviceAction.isPending && serviceAction.variables?.serviceName === serviceName;
  const cardRunning = (serviceName: string) =>
    cardBusy(serviceName) ? serviceAction.variables?.action : undefined;

  const togglePin = (serviceName: string) => {
    const next = pinnedSet.has(unitName(serviceName))
      ? pinned.filter(name => unitName(name) !== unitName(serviceName))
      : [...pinned, serviceName];

    setPinned.mutate(next, {
      onError: () => notify.error('No se pudo guardar el servicio fijado', serviceName),
    });
  };

  /* Parar pide confirmación, y cualquier acción puede acabar pidiendo la
     contraseña de sudo: las dos cosas viven en el mismo modal. */
  const [prompt, setPrompt] = useState<
    { serviceName: string; action: ServiceAction; phase: 'confirm' | 'sudo'; hint?: string } | null
  >(null);
  /* La contraseña validada se reusa mientras el detalle esté abierto, para no
     pedirla en cada clic. Solo en memoria: ni localStorage ni caché. */
  const [sudoPassword, setSudoPassword] = useState<string | undefined>();

  const execute = async (serviceName: string, action: ServiceAction, password?: string) => {
    setActionError(null);

    try {
      const result = await serviceAction.mutateAsync({ serviceName, action, sudoPassword: password });

      if (password) setSudoPassword(password);
      setPrompt(null);

      if (result.success) {
        notify.success(`Servicio ${ACTION_PAST[action]}`, serviceName);
      } else {
        notify.error(`No se pudo ejecutar «${action}» en ${serviceName}`, result.error);
        setActionError(`${serviceName}: ${result.error ?? 'systemctl terminó con error'}`);
      }
    } catch (err: unknown) {
      const error = (err ?? {}) as { code?: string; hint?: string; message?: string };

      /* El servidor pide contraseña de sudo: se abre la segunda fase del modal
         con el mismo servicio y acción, en vez de dar el error por perdido. */
      if (error.code === 'SUDO_REQUIRED') {
        setSudoPassword(undefined);
        setPrompt({ serviceName, action, phase: 'sudo', hint: error.hint ?? error.message });
        return;
      }

      const message = error.message ?? 'No se pudo ejecutar la acción';
      setActionError(`${serviceName}: ${message}`);

      /* Con la contraseña rechazada el modal sigue abierto para reintentar. */
      if (error.code !== 'SUDO_PASSWORD') {
        setPrompt(null);
        notify.error(`No se pudo ejecutar «${action}» en ${serviceName}`, message);
      }
    }
  };

  /* ── Cerrar proceso (SIGTERM) ── */
  const killProcess = useKillProcess(server.id);
  const [killPrompt, setKillPrompt] = useState<
    { proc: TopProcess; phase: 'confirm' | 'sudo'; hint?: string } | null
  >(null);
  const [killError, setKillError] = useState<string | null>(null);

  const executeKill = async (proc: TopProcess, password?: string) => {
    setKillError(null);
    const label = processLabel(proc);

    try {
      const result = await killProcess.mutateAsync({ pid: proc.pid, sudoPassword: password });

      if (password) setSudoPassword(password);
      setKillPrompt(null);

      if (!result.success) {
        notify.error(`No se pudo cerrar ${label}`, result.error);
        return;
      }
      if (result.exited) {
        setKilledPids(prev => new Set(prev).add(proc.pid));
        notify.success('Proceso cerrado', `${label} (PID ${proc.pid})`);
      } else {
        notify.warning('Señal enviada', `${label} (PID ${proc.pid}) sigue activo: puede tardar en terminar o ignorar SIGTERM.`);
      }
    } catch (err: unknown) {
      const error = (err ?? {}) as { code?: string; hint?: string; message?: string };

      if (error.code === 'SUDO_REQUIRED') {
        setSudoPassword(undefined);
        setKillPrompt({ proc, phase: 'sudo', hint: error.hint ?? error.message });
        return;
      }

      if (error.code === 'PROCESS_NOT_FOUND') {
        setKilledPids(prev => new Set(prev).add(proc.pid));
      }

      const message = error.message ?? 'No se pudo cerrar el proceso';
      setKillError(message);
      if (error.code !== 'SUDO_PASSWORD') {
        setKillPrompt(null);
        notify.error(`No se pudo cerrar ${label}`, message);
      }
    }
  };

  const runServiceAction = (serviceName: string, action: ServiceAction) => {
    setActionError(null);

    if (action === 'stop') {
      setPrompt({ serviceName, action, phase: 'confirm' });
      return;
    }

    void execute(serviceName, action, sudoPassword);
  };

  return (
    <div className="mo-view space-y-5">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="glass rounded-2xl grain p-5">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <button onClick={onBack}
              className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-white/65 hover:text-white row-hit transition">
              <ChevronLeft />
            </button>
            <div className="w-12 h-12 rounded-xl grad-brand flex items-center justify-center shrink-0
              elev-brand">
              <ServerIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{server.name}</h1>
              <p className="text-sm text-white/50">{server.ip} · {server.os}</p>
            </div>
            {statusIcon(server.status)}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => terminal.openTerminal(server.id, server.name)}
              title={terminalSession ? 'La sesión SSH sigue abierta: volver a ella' : 'Abrir una shell SSH en este servidor'}
              className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium">
              <TerminalIcon className="w-4 h-4" />
              {terminalSession ? 'Volver a la terminal' : 'Abrir Terminal'}
              {terminalSession && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-label="Sesión abierta" />}
            </button>
            <button onClick={() => setSftpOpen(true)}
              title="Subir archivos y carpetas por SFTP"
              className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium">
              <SftpIcon className="w-4 h-4" /> SFTP
            </button>
            <button onClick={() => setInstallOpen(true)}
              className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
                elev-brand-sm hover:elev-brand">
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
              <div className="h-1 rounded-full bg-track overflow-hidden">
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
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`mo-tab flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-medium ${
              activeTab === id
                ? 'mo-tab-on grad-brand text-white elev-brand-sm'
                : 'text-white/60 hover:text-white hover:bg-tint-hover'
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
          <div className="glass-soft rounded-2xl p-5">
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
          <div className="glass-soft rounded-2xl p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-4">
              <NetworkIcon className="w-4 h-4 text-violet-300" /> Red
            </h3>
            <div className="space-y-0.5">
              {/* Sin interfaces del agente no se inventa ninguna: antes decía
                  siempre "eth0", viniera lo que viniera del servidor. */}
              {primaryIface && (
                <div className="flex items-center justify-between gap-3 py-2.5 border-b border-line">
                  <span className="text-sm text-white/50 shrink-0">Interfaz</span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-white font-mono truncate">{primaryIface.iface}</span>
                    <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 shrink-0 ${
                      primaryIface.operstate === 'up'
                        ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20'
                        : 'bg-tint-active text-white/50 ring-hairline'
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
                        : 'bg-tint-active text-white/50 ring-hairline'
                    }`}>
                      {iface.operstate || '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Consumo de memoria: los 5 procesos con más memoria residente */}
          <div className="glass-soft rounded-2xl p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-4">
              <MemoryIcon className="w-4 h-4 text-violet-300" /> Consumo de memoria
            </h3>
            {topMemory.length === 0 ? (
              <p className="text-xs text-white/45">Sin datos de procesos todavía.</p>
            ) : (
              <div className="space-y-2">
                {topMemory.map(proc => (
                  <div key={proc.pid} className="glass rounded-xl px-3 py-2"
                    title={`${proc.command || proc.name}${proc.user ? `\nUsuario: ${proc.user}` : ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white/85 truncate">{processLabel(proc)}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-mono font-semibold text-white">{formatBytes(proc.memRss)}</span>
                        <button
                          onClick={() => { setKillError(null); setKillPrompt({ proc, phase: 'confirm' }); }}
                          disabled={killProcess.isPending && killProcess.variables?.pid === proc.pid}
                          title="Cerrar proceso (SIGTERM)"
                          aria-label={`Cerrar ${processLabel(proc)} (PID ${proc.pid})`}
                          className="mo-tab w-6 h-6 rounded-md flex items-center justify-center text-white/35 hover:text-rose-300 transition disabled:opacity-40"
                        >
                          <CloseIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-0.5 mb-1.5">
                      <span className="text-[10px] font-mono text-white/45">PID {proc.pid}</span>
                      <span className="text-[10px] font-mono text-white/55">{proc.mem.toFixed(1)}% RAM</span>
                    </div>
                    <div className="h-1 rounded-full bg-track overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${barGradient(proc.mem)} transition-all duration-700`}
                        style={{ width: `${Math.min(100, proc.mem)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recursos detallados */}
          <div className="glass-soft rounded-2xl p-5">
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
              {/* Un bloque por disco físico: el total arriba y sus particiones debajo */}
              {groupDisks(detail?.disk ?? []).map(group => (
                <div key={group.disk}>
                  <MetricBar
                    label={group.partitions.length === 1
                      ? `Disco ${group.disk} · ${group.partitions[0].mountPoint} (${group.used.toFixed(1)} / ${group.total.toFixed(1)} GB)`
                      : `Disco ${group.disk} (${group.used.toFixed(1)} / ${group.total.toFixed(1)} GB)`}
                    value={group.usagePercent}
                  />
                  {group.partitions.length > 1 && (
                    <div className="mt-3 ml-3 pl-3 border-l border-line space-y-2.5">
                      {group.partitions.map(p => (
                        <MetricBar
                          key={p.device || p.mountPoint}
                          compact
                          label={`${p.device.replace(/^\/dev\//, '') || p.mountPoint} · ${p.mountPoint} (${p.used.toFixed(1)} / ${p.total.toFixed(1)} GB)`}
                          value={p.usagePercent}
                        />
                      ))}
                    </div>
                  )}
                </div>
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
                    ? 'mo-tab-on grad-brand-soft text-white border-hairline'
                    : 'glass-soft text-white/60 hover:text-white hover:border-hairline-hover'}`}
              >
                Solo activos
              </button>
              <button onClick={() => setInstallOpen(true)}
                className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium
                  elev-brand-sm">
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
            <div className="edge-dashed rounded-xl py-10 text-center">
              <p className="text-sm text-white/55">Sin servicios reportados</p>
              <p className="text-xs text-white/35 mt-1">
                El agente envía el inventario de systemd cada pocos minutos.
              </p>
            </div>
          ) : (
            <>
              {pinnedServices.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-medium text-white/55 mb-3">
                    Fijados · {pinnedServices.length}
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {pinnedServices.map(service => (
                      <ServiceCard
                        key={service.name}
                        service={service}
                        pinned
                        busy={cardBusy(service.name)}
                        running={cardRunning(service.name)}
                        onAction={runServiceAction}
                        onTogglePin={togglePin}
                        onLogs={setLogsFor}
                      />
                    ))}
                  </div>
                </div>
              )}

              {pinnedServices.length > 0 && visibleServices.length > 0 && (
                <p className="text-xs font-medium text-white/55 mb-3">
                  Resto del inventario
                </p>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleServices.map(service => (
                  <ServiceCard
                    key={service.name}
                    service={service}
                    pinned={false}
                    busy={cardBusy(service.name)}
                    running={cardRunning(service.name)}
                    onAction={runServiceAction}
                    onTogglePin={togglePin}
                    onLogs={setLogsFor}
                  />
                ))}
              </div>
            </>
          )}

          {services.length > visibleServices.length + pinnedServices.length && (
            <p className="text-xs text-white/35 mt-4 text-center">
              Mostrando {visibleServices.length + pinnedServices.length} de {services.length}.
              Fija los que uses a diario o afina el filtro para ver el resto.
            </p>
          )}
        </div>
      )}

      {/* ── Acción sobre un servicio ─────────────────────────────────── */}
      {prompt && (
        <ServiceActionModal
          serviceName={prompt.serviceName}
          action={prompt.action}
          phase={prompt.phase}
          hint={prompt.hint}
          error={actionError}
          pending={serviceAction.isPending}
          onConfirm={password =>
            void execute(prompt.serviceName, prompt.action, password ?? sudoPassword)
          }
          onClose={() => { setPrompt(null); setActionError(null); }}
        />
      )}

      {/* ── Comandos ejecutados ─────────────────────────────────────── */}
      {activeTab === 'commands' && (
        <Suspense fallback={<div className="glass rounded-2xl grain p-5 text-sm text-white/45">Cargando…</div>}>
          <CommandsTab
            serverId={server.id}
            onReuse={command => commandBarRef.current?.load(command)}
          />
        </Suspense>
      )}

      {/* ── Docker ──────────────────────────────────────────────────── */}
      {activeTab === 'docker' && dockerUnit && (
        <Suspense fallback={<div className="glass rounded-2xl grain p-5 text-sm text-white/45">Cargando…</div>}>
          <DockerTab serverId={server.id} dockerState={dockerUnit.state} />
        </Suspense>
      )}

      {/* ── Kubernetes ──────────────────────────────────────────────── */}
      {activeTab === 'kubernetes' && kubeUnit && (
        <Suspense fallback={<div className="glass rounded-2xl grain p-5 text-sm text-white/45">Cargando…</div>}>
          <KubernetesTab serverId={server.id} unit={{ name: unitName(kubeUnit.name), state: kubeUnit.state }} />
        </Suspense>
      )}

      {/* ── Cerrar un proceso ────────────────────────────────────────── */}
      {killPrompt && (
        <ProcessKillModal
          name={processLabel(killPrompt.proc)}
          pid={killPrompt.proc.pid}
          command={killPrompt.proc.command}
          phase={killPrompt.phase}
          hint={killPrompt.hint}
          error={killError}
          pending={killProcess.isPending}
          onConfirm={password => void executeKill(killPrompt.proc, password ?? sudoPassword)}
          onClose={() => { setKillPrompt(null); setKillError(null); }}
        />
      )}

      {/* ── Journal de un servicio ───────────────────────────────────── */}
      {logsFor && (
        <ServiceLogsModal
          serverId={server.id}
          serviceName={logsFor}
          onClose={() => setLogsFor(null)}
        />
      )}

      {/* ── SFTP ─────────────────────────────────────────────────────── */}
      {sftpOpen && (
        <Suspense fallback={null}>
          <SftpModal
            serverId={server.id}
            serverName={server.name}
            isOpen
            onClose={() => setSftpOpen(false)}
          />
        </Suspense>
      )}

      {/* ── Instalar servicios ───────────────────────────────────────── */}
      <InstallServiceModal serverId={server.id} serverName={server.name} isOpen={installOpen} onClose={() => setInstallOpen(false)} />

      {/* ── Línea de comandos flotante: visible en cualquier tab ─────── */}
      <CommandBar ref={commandBarRef} serverId={server.id} serverName={server.name} />
    </div>
  );
};
