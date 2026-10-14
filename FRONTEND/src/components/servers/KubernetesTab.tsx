import React, { useEffect, useMemo, useState } from 'react';
import { useKubernetesPods } from '@hooks/useKubernetesPods';
import type { KubernetesPod } from '@services/kubernetes.service';
import { Select } from '@components/common/Select';
import { formatBytes } from '@utils/metrics';
import { timeAgo } from '@utils/time';

const sp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const LoaderIcon  = ({ className = 'w-4 h-4' }) => <svg {...sp} className={`${className} animate-spin`}><path d="M12 3a9 9 0 109 9" /></svg>;
const RefreshIcon = ({ className = 'w-4 h-4' }) => <svg {...sp} className={className}><path d="M21 12a9 9 0 11-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>;
const ChevronIcon = ({ open }: { open: boolean }) => <svg {...sp} className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}><path d="M9 6l6 6-6 6" /></svg>;

interface Props {
  serverId: string;
  /** Unidad de systemd que delató Kubernetes (k3s, kubelet, microk8s…) y su estado. */
  unit: { name: string; state: string };
}

interface ApiErrorLike { code?: string; message?: string; hint?: string }

type View = 'active' | 'problems' | 'all';

const DONE = new Set(['Succeeded', 'Completed']);
const isDone = (p: KubernetesPod) => p.phase === 'Succeeded' || DONE.has(p.status);
/** Algo va mal: no está en marcha, o en marcha con contenedores sin listos. */
const isProblem = (p: KubernetesPod) => !isDone(p) && (p.status !== 'Running' || p.ready < p.total);

/* Tono del estado: semántico (ok, atención, error) o neutro para lo terminado. */
function statusTone(p: KubernetesPod): string {
  if (isDone(p)) return 'bg-tint-active text-white/55 ring-hairline';
  if (p.status === 'Running' && p.ready === p.total) return 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20';
  if (p.status === 'Running' || p.status === 'Pending' || p.status === 'ContainerCreating' || p.status === 'Terminating' || p.status.startsWith('Init:') && !/Err|BackOff/.test(p.status)) {
    return 'bg-amber-500/15 text-amber-300 ring-amber-400/20';
  }
  return 'bg-rose-500/15 text-rose-300 ring-rose-400/20';
}

/** «3d», «5h», «12m»: la edad como la da kubectl. */
function age(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

const cpu = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} cores` : `${Math.round(m)}m`);

const COLS = 'grid grid-cols-[minmax(0,1fr)_120px_64px_72px_72px_80px_56px] gap-3 items-center';

const PodRow = ({ pod, metrics }: { pod: KubernetesPod; metrics: boolean }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`${COLS} w-full text-left px-3 py-2.5 rounded-lg hover:bg-tint-hover transition-colors`}>
        <span className="min-w-0 flex items-center gap-2">
          <span className="text-white/40 shrink-0"><ChevronIcon open={open} /></span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-white/90 truncate" title={pod.name}>{pod.name}</span>
            <span className="block text-[11px] text-white/40 truncate">
              <span className="font-mono">{pod.namespace}</span>{pod.owner ? ` · ${pod.owner}` : ''}
            </span>
          </span>
        </span>
        <span className="min-w-0">
          <span className={`inline-block max-w-full truncate text-[10px] font-medium px-1.5 py-0.5 rounded-md ring-1 ${statusTone(pod)}`} title={pod.status}>
            {pod.status}
          </span>
        </span>
        <span className={`text-xs font-mono tabular-nums ${pod.ready < pod.total && !isDone(pod) ? 'text-amber-300' : 'text-white/70'}`}>{pod.ready}/{pod.total}</span>
        <span className={`text-xs font-mono tabular-nums ${pod.restarts > 0 ? 'text-amber-300' : 'text-white/45'}`}>{pod.restarts}</span>
        <span className="text-xs font-mono tabular-nums text-white/70">{pod.usage ? cpu(pod.usage.cpuMillicores) : metrics ? '—' : ''}</span>
        <span className="text-xs font-mono tabular-nums text-white/70">{pod.usage ? formatBytes(pod.usage.memoryBytes) : metrics ? '—' : ''}</span>
        <span className="text-xs font-mono tabular-nums text-white/45 text-right" title={pod.createdAt ?? undefined}>{age(pod.createdAt)}</span>
      </button>

      {open && (
        <div className="ml-8 mr-3 mb-2 glass-soft rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
            <Detail label="Nodo">{pod.node ?? '—'}</Detail>
            <Detail label="IP del pod">{pod.podIP ?? '—'}</Detail>
            <Detail label="Fase">{pod.phase}</Detail>
            <Detail label="Creado">{pod.createdAt ? timeAgo(pod.createdAt) : '—'}</Detail>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-white/40">Contenedores</p>
            {pod.containers.map(c => (
              <div key={c.name} className="flex items-center gap-3 text-xs min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.ready ? 'bg-emerald-400' : c.state === 'terminated' ? 'bg-white/30' : 'bg-amber-400'}`} />
                <span className="font-medium text-white/80 shrink-0">{c.name}</span>
                <span className="font-mono text-white/45 truncate" title={c.image}>{c.image}</span>
                <span className="ml-auto shrink-0 text-white/45">{c.reason ?? c.state}{c.restarts ? ` · ${c.restarts} reinicios` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">{label}</p>
    <div className="font-mono text-white/75 truncate">{children}</div>
  </div>
);

const Chip = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 h-7 rounded-lg ring-1 ${tone}`}>
    <span className="font-semibold tabular-nums">{value}</span> {label}
  </span>
);

/**
 * Pods de Kubernetes del servidor. Se leen por SSH con kubectl (o el de k3s,
 * microk8s o rke2) al abrir el tab y luego solo con Actualizar. Solo lectura.
 */
export const KubernetesTab: React.FC<Props> = ({ serverId, unit }) => {
  const [filter, setFilter] = useState('');
  const [namespace, setNamespace] = useState('all');
  const [view, setView] = useState<View>('active');
  const [sudoPassword, setSudoPassword] = useState<string | undefined>();
  const [sudoDraft, setSudoDraft] = useState('');
  const running = unit.state === 'active';

  const { data, error, isFetching, isLoading, refetch } = useKubernetesPods(serverId, running, sudoPassword);
  const apiError = (error ?? null) as ApiErrorLike | null;
  const needsSudo = apiError?.code === 'SUDO_REQUIRED' || apiError?.code === 'SUDO_PASSWORD';

  useEffect(() => {
    if (sudoPassword) void refetch();
  }, [sudoPassword, refetch]);

  const all = useMemo(() => data?.pods ?? [], [data]);
  const namespaces = useMemo(() => [...new Set(all.map(p => p.namespace))].sort(), [all]);
  const counts = useMemo(() => ({
    running: all.filter(p => p.status === 'Running' && p.ready === p.total).length,
    problems: all.filter(isProblem).length,
    done: all.filter(isDone).length,
  }), [all]);

  const pods = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return all
      .filter(p => namespace === 'all' || p.namespace === namespace)
      .filter(p => (view === 'all' ? true : view === 'problems' ? isProblem(p) : !isDone(p)))
      .filter(p => !term || p.name.toLowerCase().includes(term) || (p.owner ?? '').toLowerCase().includes(term)
        || p.containers.some(c => c.image.toLowerCase().includes(term)))
      /* Primero lo que falla; dentro, por namespace y nombre. */
      .sort((a, b) => Number(isProblem(b)) - Number(isProblem(a)) || a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name));
  }, [all, filter, namespace, view]);

  const VIEWS: [View, string][] = [['active', 'Activos'], ['problems', `Con problemas${counts.problems ? ` (${counts.problems})` : ''}`], ['all', 'Todos']];

  return (
    <div className="mo-panel glass rounded-2xl grain p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Pods de Kubernetes</h2>
          <p className="text-xs text-white/45 mt-0.5">
            {data
              ? `${data.distribution} · ${all.length} pods · leído ${timeAgo(data.readAt)}`
              : running ? 'Leyendo los pods por SSH…' : `${unit.name} está ${unit.state}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {namespaces.length > 1 && (
            <div className="glass-input rounded-xl h-9 flex items-center px-3">
              <Select value={namespace} onChange={setNamespace} aria-label="Namespace" className="text-white/85"
                options={[{ value: 'all', label: 'Todos los namespaces' }, ...namespaces.map(n => ({ value: n, label: n }))]} />
            </div>
          )}
          <div className="glass-input rounded-xl h-9 flex items-center px-3 gap-2">
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar pods…"
              className="bg-transparent outline-none text-sm text-white/90 placeholder:text-white/30 w-40" />
          </div>
          <button onClick={() => void refetch()} disabled={isFetching || !running}
            className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft row-hit text-white/75 hover:text-white text-xs font-medium disabled:opacity-40">
            {isFetching ? <LoaderIcon /> : <RefreshIcon />}
            {isFetching ? 'Leyendo…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {!running ? (
        <div className="edge-dashed rounded-xl py-10 text-center">
          <p className="text-sm text-white/55">Kubernetes no está activo ({unit.name})</p>
          <p className="text-xs text-white/35 mt-1">Inícialo desde el tab Servicios para ver sus pods.</p>
        </div>
      ) : needsSudo ? (
        <div className="max-w-md space-y-3">
          <div className="glass-soft rounded-xl p-4">
            <div className="text-sm font-semibold text-white mb-1">Hace falta sudo</div>
            <p className="text-xs text-white/60 leading-relaxed">
              {apiError?.code === 'SUDO_PASSWORD'
                ? apiError.message
                : apiError?.hint ?? 'El kubeconfig del clúster solo lo puede leer root y sudo pide contraseña.'}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="glass-input rounded-xl h-11 flex items-center px-3.5 flex-1">
              <input autoFocus type="password" autoComplete="off" value={sudoDraft}
                onChange={e => setSudoDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && sudoDraft) setSudoPassword(sudoDraft); }}
                placeholder="Contraseña del usuario SSH"
                className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25" />
            </div>
            <button onClick={() => setSudoPassword(sudoDraft)} disabled={!sudoDraft || isFetching}
              className="mo-tab h-11 px-5 rounded-xl grad-brand elev-brand-sm text-white text-sm font-semibold disabled:opacity-40">
              {isFetching ? 'Leyendo…' : 'Continuar'}
            </button>
          </div>
          <p className="text-[11px] text-white/40">Se usa solo para leer Kubernetes mientras el detalle esté abierto y no se guarda.</p>
        </div>
      ) : apiError ? (
        <div className="glass-soft rounded-xl p-4 border border-rose-400/20">
          <p className="text-sm text-rose-300">{apiError.message ?? 'No se pudo leer Kubernetes'}</p>
          {apiError.hint && <p className="text-xs font-mono text-white/45 mt-1 break-all">{apiError.hint}</p>}
        </div>
      ) : isLoading ? (
        <div className="edge-dashed rounded-xl py-10 text-center text-sm text-white/45">Leyendo los pods del clúster…</div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Chip label="en ejecución" value={counts.running} tone="bg-emerald-500/10 text-emerald-300 ring-emerald-400/20" />
            <Chip label="con problemas" value={counts.problems} tone={counts.problems ? 'bg-rose-500/10 text-rose-300 ring-rose-400/20' : 'bg-tint-active text-white/55 ring-hairline'} />
            <Chip label="completados" value={counts.done} tone="bg-tint-active text-white/55 ring-hairline" />
            <span className="flex-1" />
            <div role="radiogroup" aria-label="Qué pods mostrar" className="glass-soft rounded-xl h-8 flex items-center gap-1 p-1">
              {VIEWS.map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)}
                  className={`mo-tab h-6 px-2.5 rounded-lg text-xs ${view === id ? 'mo-tab-on grad-brand text-white elev-brand-sm' : 'text-white/55 hover:text-white hover:bg-tint-hover'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {pods.length === 0 ? (
            <div className="edge-dashed rounded-xl py-10 text-center">
              <p className="text-sm text-white/55">
                {all.length === 0 ? 'No hay pods en el clúster' : view === 'problems' && !filter ? 'Ningún pod con problemas' : 'Ningún pod coincide con el filtro'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <div className="min-w-[720px]">
                <div className={`${COLS} px-3 h-8 text-[10px] font-semibold uppercase tracking-wider text-white/40 border-b border-line`}>
                  <span className="pl-5">Pod</span>
                  <span>Estado</span>
                  <span>Listos</span>
                  <span>Reinicios</span>
                  <span>{data?.metrics ? 'CPU' : ''}</span>
                  <span>{data?.metrics ? 'Memoria' : ''}</span>
                  <span className="text-right">Edad</span>
                </div>
                <div className="divide-y divide-line">
                  {pods.map(p => <PodRow key={`${p.namespace}/${p.name}`} pod={p} metrics={Boolean(data?.metrics)} />)}
                </div>
              </div>
              {data && !data.metrics && (
                <p className="text-[11px] text-white/40 mt-3">Sin consumo por pod: el clúster no tiene metrics-server instalado.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
