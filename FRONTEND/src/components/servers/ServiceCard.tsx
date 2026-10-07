import React from 'react';
import { formatBytes } from '@utils/metrics';
import type { SystemdServiceInfo } from '@hooks/useServerDetail';
import type { ServiceAction } from '@services/service-control.service';
import { isProtectedUnit, unitName } from '@utils/services';

/* ── Inline SVG icons ─────────────────────────────────────────────── */
const sp = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const PackageIcon  = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const GlobeIcon    = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;
const DbIcon       = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6"/></svg>;
const CodeIcon     = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
const TerminalIcon = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
const CubeIcon     = ({ className='w-5 h-5' }) => <svg {...sp} className={className}><path d="M21 7.5l-9-4.5-9 4.5v9l9 4.5 9-4.5v-9z"/><path d="M3 7.5L12 12l9-4.5M12 12v9"/></svg>;
const PlayIcon     = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const PauseIcon    = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
const RestartIcon  = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><path d="M21 12a9 9 0 11-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>;
const LoaderIcon   = ({ className='w-4 h-4' }) => <svg {...sp} className={`${className} animate-spin`}><path d="M12 3a9 9 0 109 9"/></svg>;
const LogsIcon     = ({ className='w-4 h-4' }) => <svg {...sp} className={className}><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>;
const PinIcon      = ({ className='w-4 h-4', filled=false }) => <svg {...sp} className={className} fill={filled ? 'currentColor' : 'none'}><path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z"/></svg>;

const serviceIconMap: Record<string, React.ReactNode> = {
  nginx: <GlobeIcon />, apache: <GlobeIcon />,
  mysql: <DbIcon />, postgresql: <DbIcon />, redis: <DbIcon />, mongodb: <DbIcon />,
  wordpress: <CodeIcon />, nodejs: <TerminalIcon />, docker: <CubeIcon />,
};
const getServiceIcon = (name: string) => serviceIconMap[name] ?? <PackageIcon />;

/* ── Estado de una unidad systemd ─────────────────────────────────── */
const ServiceStateBadge = ({ state }: { state: string }) => {
  const tone =
    state === 'active'  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20' :
    state === 'failed'  ? 'bg-rose-500/15 text-rose-300 ring-rose-400/20' :
                          'bg-tint-active text-white/50 ring-hairline';
  const label =
    state === 'active' ? 'Activo' : state === 'failed' ? 'Fallido' :
    state === 'inactive' ? 'Inactivo' : 'Desconocido';

  return (
    <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 shrink-0 ${tone}`}>
      {label}
    </span>
  );
};

interface Props {
  service: SystemdServiceInfo;
  pinned: boolean;
  /** Acción en curso sobre esta unidad, si la hay. */
  running?: ServiceAction;
  busy: boolean;
  onAction: (serviceName: string, action: ServiceAction) => void;
  onTogglePin: (serviceName: string) => void;
  onLogs: (serviceName: string) => void;
}

export const ServiceCard: React.FC<Props> = ({
  service, pinned, running, busy, onAction, onTogglePin, onLogs,
}) => {
  const protectedUnit = isProtectedUnit(service.name);

  return (
    /* `transition` de Tailwind pisaba la de `.row-hit` y animaba también
       filtros y sombras. content-visibility: el navegador se salta las
       tarjetas fuera de pantalla (hasta 200 al filtrar). */
    <div className="glass-soft rounded-xl p-4 row-hit [content-visibility:auto] [contain-intrinsic-size:auto_168px]">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg glass flex items-center justify-center text-white/70 shrink-0">
            {getServiceIcon(unitName(service.name))}
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

        <div className="flex items-center gap-1.5 shrink-0">
          <ServiceStateBadge state={service.state} />
          <button
            onClick={() => onTogglePin(service.name)}
            title={pinned ? 'Quitar de fijados' : 'Fijar arriba'}
            aria-label={pinned ? `Quitar ${service.name} de fijados` : `Fijar ${service.name}`}
            className={`mo-tab w-7 h-7 rounded-lg flex items-center justify-center transition
              ${pinned ? 'text-violet-300' : 'text-white/35 hover:text-white/75'}`}
          >
            <PinIcon className="w-3.5 h-3.5" filled={pinned} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-white/45 mb-3 flex-wrap">
        <button
          onClick={() => onAction(service.name, service.enabled ? 'disable' : 'enable')}
          disabled={busy || (service.enabled && protectedUnit)}
          title={
            service.enabled && protectedUnit
              ? 'El panel no deshabilita las unidades que sostienen su propia conexión'
              : service.enabled
                ? 'Quitar del arranque automático'
                : 'Arrancar junto al sistema'
          }
          className={`mo-tab rounded-md px-1.5 py-0.5 -ml-1.5 ring-1 disabled:opacity-40
            ${service.enabled
              ? 'text-white/60 ring-hairline hover:text-white'
              : 'text-white/35 ring-transparent hover:text-white/70 hover:ring-hairline'}`}
        >
          {running === 'enable' || running === 'disable'
            ? 'Guardando…'
            : service.enabled ? 'Habilitado al arranque' : 'No habilitado'}
        </button>
        {service.pid && <span className="font-mono">PID {service.pid}</span>}
        {service.memory > 0 && (
          <span className="font-mono tabular-nums">{formatBytes(service.memory)}</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onAction(service.name, 'start')}
          disabled={busy || service.state === 'active'}
          className="mo-tab flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/20 text-emerald-300 hover:bg-emerald-500/25 text-xs font-medium disabled:opacity-40"
        >
          {running === 'start' ? <><LoaderIcon /> Iniciando…</> : <><PlayIcon /> Iniciar</>}
        </button>
        <button
          onClick={() => onAction(service.name, 'stop')}
          disabled={busy || service.state !== 'active' || protectedUnit}
          title={
            protectedUnit
              ? 'El panel controla el servidor por SSH: parar esta unidad lo dejaría incomunicado'
              : undefined
          }
          className="mo-tab flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-rose-500/15 border border-rose-400/20 text-rose-300 hover:bg-rose-500/25 text-xs font-medium disabled:opacity-40"
        >
          {running === 'stop' ? <><LoaderIcon /> Parando…</> : <><PauseIcon /> Parar</>}
        </button>
        <button
          onClick={() => onAction(service.name, 'restart')}
          disabled={busy}
          title="Reiniciar"
          aria-label={`Reiniciar ${service.name}`}
          className="mo-tab w-8 h-8 rounded-lg glass-soft flex items-center justify-center text-white/55 hover:text-white disabled:opacity-40 shrink-0"
        >
          {running === 'restart' ? <LoaderIcon /> : <RestartIcon />}
        </button>
        <button
          onClick={() => onLogs(service.name)}
          title="Ver el journal"
          aria-label={`Ver el journal de ${service.name}`}
          className="mo-tab w-8 h-8 rounded-lg glass-soft flex items-center justify-center text-white/55 hover:text-white shrink-0"
        >
          <LogsIcon />
        </button>
      </div>
    </div>
  );
};
