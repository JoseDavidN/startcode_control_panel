import React, { useEffect, useMemo, useState } from 'react';
import { useDockerContainers } from '@hooks/useDockerContainers';
import type { DockerContainer } from '@services/docker.service';
import { barGradient } from '@utils/metrics';
import { timeAgo } from '@utils/time';

const sp = { viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.75, strokeLinecap:'round' as const, strokeLinejoin:'round' as const };

const LoaderIcon  = ({ className = 'w-4 h-4' }) => <svg {...sp} className={`${className} animate-spin`}><path d="M12 3a9 9 0 109 9" /></svg>;
const RefreshIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={className}><path d="M21 12a9 9 0 11-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>;

interface Props {
  serverId: string;
  /** El estado de la unidad docker.service según el inventario del agente. */
  dockerState: string;
}

interface ApiErrorLike { code?: string; message?: string; hint?: string }

/* "Up 6 days (healthy)" → healthy / unhealthy / starting; si no hay
   healthcheck, solo el estado del contenedor. */
const health = (c: DockerContainer): { label: string; tone: string } => {
  const match = /\((healthy|unhealthy|health: starting)\)/.exec(c.status);
  if (match?.[1] === 'unhealthy') return { label: 'unhealthy', tone: 'bg-rose-500/15 text-rose-300 ring-rose-400/20' };
  if (match?.[1] === 'health: starting') return { label: 'starting', tone: 'bg-amber-500/15 text-amber-300 ring-amber-400/20' };
  if (match?.[1] === 'healthy') return { label: 'healthy', tone: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20' };
  return { label: c.state, tone: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20' };
};

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">{label}</p>
    <div className="text-xs font-mono text-white/75 break-all">{children}</div>
  </div>
);

const Bar = ({ label, value, detail }: { label: string; value: number; detail?: string }) => (
  <div>
    <div className="flex items-center justify-between gap-3 mb-1">
      <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      <span className="text-xs font-mono text-white/75">{detail ?? `${value.toFixed(1)}%`}</span>
    </div>
    <div className="h-1 rounded-full bg-track overflow-hidden">
      <div className={`h-full rounded-full bg-gradient-to-r ${barGradient(value)} transition-all duration-700`}
        style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  </div>
);

const ContainerRow = ({ c }: { c: DockerContainer }) => {
  const h = health(c);
  const dash = '—';

  return (
    <div className="glass-soft rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{c.name}</span>
            <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 ${h.tone}`}>
              {h.label}
            </span>
            {c.composeProject && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md ring-1 bg-tint-active text-white/60 ring-hairline"
                title="Proyecto · servicio de docker compose">
                {c.composeProject}{c.composeService ? ` · ${c.composeService}` : ''}
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-white/55 mt-1 truncate" title={c.image}>{c.image}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-mono text-white/45">{c.id}</p>
          <p className="text-xs text-white/55 mt-0.5">{c.status}</p>
        </div>
      </div>

      {c.stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Bar label="CPU" value={c.stats.cpuPercent} />
          <Bar label="Memoria" value={c.stats.memPercent}
            detail={`${c.stats.memUsage} · ${c.stats.memPercent.toFixed(1)}%`} />
        </div>
      ) : (
        <p className="text-xs text-white/40 mb-4">Sin estadísticas de consumo para este contenedor.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
        <Detail label="Puertos">
          {c.ports.length ? c.ports.map(p => <div key={p}>{p}</div>) : dash}
        </Detail>
        <Detail label="Redes">{c.networks.length ? c.networks.join(', ') : dash}</Detail>
        <Detail label="Volúmenes">
          {c.mounts.length ? c.mounts.map(m => <div key={m}>{m}</div>) : dash}
        </Detail>
        <Detail label="Creado">{c.runningFor || c.createdAt || dash}</Detail>
        <Detail label="Red I/O">{c.stats?.netIO || dash}</Detail>
        <Detail label="Disco I/O">{c.stats?.blockIO || dash}</Detail>
        <Detail label="PIDs">{c.stats ? c.stats.pids : dash}</Detail>
        <Detail label="Comando"><span className="line-clamp-2" title={c.command}>{c.command || dash}</span></Detail>
      </div>
    </div>
  );
};

/**
 * Contenedores Docker en ejecución. Se leen por SSH al abrir el tab (no los
 * manda el agente), así que la lista es una foto que se refresca cada 15 s.
 */
export const DockerTab: React.FC<Props> = ({ serverId, dockerState }) => {
  const [filter, setFilter] = useState('');
  const [sudoPassword, setSudoPassword] = useState<string | undefined>();
  const [sudoDraft, setSudoDraft] = useState('');
  const daemonUp = dockerState === 'active';

  const { data, error, isFetching, isLoading, refetch } = useDockerContainers(serverId, daemonUp, sudoPassword);
  const apiError = (error ?? null) as ApiErrorLike | null;
  const needsSudo = apiError?.code === 'SUDO_REQUIRED' || apiError?.code === 'SUDO_PASSWORD';

  /* La contraseña entra por estado: el refetch tiene que salir después del
     render que la lleva al queryFn. */
  useEffect(() => {
    if (sudoPassword) void refetch();
  }, [sudoPassword, refetch]);

  const containers = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return [...(data?.containers ?? [])]
      .filter(c =>
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.image.toLowerCase().includes(term) ||
        (c.composeProject ?? '').toLowerCase().includes(term),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, filter]);

  return (
    <div className="mo-panel glass rounded-2xl grain p-5">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Contenedores Docker</h2>
          <p className="text-xs text-white/45 mt-0.5">
            {data
              ? `${data.containers.length} en ejecución · leído ${timeAgo(data.readAt)}`
              : daemonUp ? 'Leyendo docker ps por SSH…' : `docker.service está ${dockerState}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="glass-input rounded-xl h-9 flex items-center px-3 gap-2">
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filtrar contenedores…"
              className="bg-transparent outline-none text-sm text-white/90 placeholder:text-white/30 w-44"
            />
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isFetching || !daemonUp}
            className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft row-hit
              text-white/75 hover:text-white text-xs font-medium disabled:opacity-40"
          >
            {isFetching ? <LoaderIcon /> : <RefreshIcon />}
            {isFetching ? 'Leyendo…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {!daemonUp ? (
        <div className="edge-dashed rounded-xl py-10 text-center">
          <p className="text-sm text-white/55">El servicio de Docker no está activo</p>
          <p className="text-xs text-white/35 mt-1">Inícialo desde el tab Servicios para ver sus contenedores.</p>
        </div>
      ) : needsSudo ? (
        <div className="max-w-md space-y-3">
          <div className="glass-soft rounded-xl p-4">
            <div className="text-sm font-semibold text-white mb-1">Hace falta sudo</div>
            <p className="text-xs text-white/60 leading-relaxed">
              {apiError?.code === 'SUDO_PASSWORD'
                ? apiError.message
                : apiError?.hint ?? 'El usuario SSH no está en el grupo docker y sudo pide contraseña.'}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="glass-input rounded-xl h-11 flex items-center px-3.5 flex-1">
              <input
                autoFocus
                type="password"
                autoComplete="off"
                value={sudoDraft}
                onChange={e => setSudoDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && sudoDraft) setSudoPassword(sudoDraft); }}
                placeholder="Contraseña del usuario SSH"
                className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25"
              />
            </div>
            <button
              onClick={() => setSudoPassword(sudoDraft)}
              disabled={!sudoDraft || isFetching}
              className="mo-tab h-11 px-5 rounded-xl grad-brand elev-brand-sm text-white text-sm font-semibold disabled:opacity-40"
            >
              {isFetching ? 'Leyendo…' : 'Continuar'}
            </button>
          </div>
          <p className="text-[11px] text-white/40">Se usa solo para leer Docker mientras el detalle esté abierto y no se guarda.</p>
        </div>
      ) : apiError ? (
        <div className="glass-soft rounded-xl p-4 border border-rose-400/20">
          <p className="text-sm text-rose-300">{apiError.message ?? 'No se pudo leer Docker'}</p>
          {apiError.hint && <p className="text-xs font-mono text-white/45 mt-1 break-all">{apiError.hint}</p>}
        </div>
      ) : isLoading ? (
        <div className="edge-dashed rounded-xl py-10 text-center text-sm text-white/45">
          Leyendo contenedores del servidor…
        </div>
      ) : containers.length === 0 ? (
        <div className="edge-dashed rounded-xl py-10 text-center">
          <p className="text-sm text-white/55">
            {filter ? 'Ningún contenedor coincide con el filtro' : 'No hay contenedores en ejecución'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {containers.map(c => <ContainerRow key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
};
