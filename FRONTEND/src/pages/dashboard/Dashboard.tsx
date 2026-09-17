import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useServers } from '@hooks/useServers';
import { useUnreadCount } from '@hooks/useNotificationsFeed';
import { useOverview, useHistorical } from '@hooks/useMonitoring';
import { useServersLive } from '@hooks/useServersLive';
import { useSecuritySettings } from '@hooks/useSecuritySettings';
import { useMonitoringSettings } from '@hooks/useMonitoringSettings';
import { MetricBar } from '@components/common/MetricBar';
import { barGradient } from '@utils/metrics';
import { ROUTES } from '@utils/constants';
import { timeAgo } from '@utils/time';
import { Card } from '@components/common/Card';

/* ── Glassmorphism primitives ─────────────────────────────────────── */

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
    <Card className="p-5 row-hit flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-white/50 font-medium">{label}</div>
        <div className={`text-4xl font-extrabold tracking-tight mt-1 tabular-nums ${accent ?? ''}`}>{value}</div>
        {sub && <div className="text-xs text-white/50 mt-1 truncate">{sub}</div>}
      </div>
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${t.wrap} ring-1 ${t.ring} flex items-center justify-center backdrop-blur-md shrink-0`}>
        {icon}
      </div>
    </Card>
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
  stack:    <I d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" className="w-6 h-6 text-emerald-300" />,
  globe:    <I d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3.5 3 14.5 0 18-3-3.5-3-14.5 0-18z" className="w-6 h-6 text-sky-300" />,
  database: <I d="M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" className="w-6 h-6 text-amber-300" />,
  cpu:      <I d="M6 6h12v12H6zM9 9h6v6H9M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" className="w-4 h-4" />,
  alert:    <I d="M12 4L2 20h20L12 4zM12 10v5M12 18v.01" className="w-4 h-4" />,
  check:    <I d="M20 6L9 17l-5-5" className="w-4 h-4" />,
  bolt:     <I d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" className="w-4 h-4" />,
};

/* ── Estado vacío honesto ─────────────────────────────────────────── */
const Empty = ({ title, hint }: { title: string; hint: string }) => (
  <div
    className="edge-dashed rounded-xl flex flex-col items-center justify-center text-center gap-2 py-10 px-6"
  >
    <span className="text-white/20">{icons.server}</span>
    <div className="text-sm font-medium text-white/60">{title}</div>
    <p className="text-xs text-white/35 max-w-[380px] leading-relaxed">{hint}</p>
  </div>
);

const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <h2 className="text-base font-semibold text-white/90 tracking-tight">{children}</h2>
    {right}
  </div>
);

/* ── Gráfica de 24 h ──────────────────────────────────────────────── */
const HistoryChart = ({
  serverId, cpuThreshold, memoryThreshold,
}: {
  serverId: string | undefined;
  cpuThreshold: number;
  memoryThreshold: number;
}) => {
  const { data, isLoading } = useHistorical(serverId, 24);

  /* Las tres series comparten los mismos cubos, así que se cosen por índice. */
  const points = useMemo(() => {
    if (!data?.cpu?.length) return [];
    return data.cpu.map((p, i) => ({
      t: new Date(p.timestamp).getTime(),
      cpu: p.value,
      memory: data.memory[i]?.value ?? 0,
      disk: data.disk[i]?.value ?? 0,
    }));
  }, [data]);

  if (isLoading) {
    return <div className="h-[260px] flex items-center justify-center text-sm text-white/40">Cargando serie…</div>;
  }

  if (!points.length) {
    return (
      <Empty
        title="Sin histórico de métricas"
        hint="La serie se construye con lo que envía el agente de monitoreo. En cuanto reporte, aquí aparecerán las últimas 24 horas de CPU y memoria."
      />
    );
  }

  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-1)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--brand-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gMem" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-2)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--brand-2)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--hairline-soft)" vertical={false} />
          <XAxis
            dataKey="t" tickFormatter={fmtTime} minTickGap={48}
            tick={{ fontSize: 11, fill: 'rgb(var(--surface-rgb) / 0)' }}
            stroke="var(--hairline)"
            tickLine={false}
            axisLine={false}
            style={{ fill: 'currentColor' }}
            className="text-white/40"
          />
          <YAxis
            domain={[0, 100]} unit="%" width={46}
            tickLine={false} axisLine={false} minTickGap={8}
            className="text-white/40"
            tick={{ fontSize: 11 }}
          />

          {/* Los mismos umbrales que disparan las alertas: explican por qué saltó una */}
          <ReferenceLine y={cpuThreshold} stroke="var(--color-amber-400)" strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={memoryThreshold} stroke="var(--color-rose-400)" strokeDasharray="4 4" strokeOpacity={0.35} />

          <Tooltip
            contentStyle={{
              background: 'rgb(var(--surface-rgb) / 0.92)',
              border: '1px solid var(--hairline)',
              borderRadius: 12,
              color: 'var(--ink)',
              fontSize: 12,
            }}
            labelFormatter={(t: number) =>
              new Date(t).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
            }
            formatter={(v: number, name: string) => [`${Math.round(v)}%`, name]}
          />

          <Area type="monotone" dataKey="cpu" name="CPU" stroke="var(--brand-1)" fill="url(#gCpu)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="memory" name="Memoria" stroke="var(--brand-2)" fill="url(#gMem)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ── Dashboard ────────────────────────────────────────────────────── */
export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { data: unreadCount = 0 } = useUnreadCount();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: servers = [], isLoading: serversLoading } = useServers();
  const { data: overview } = useOverview();
  const { runtime, onlineCount: liveOnlineCount } = useServersLive();
  const { settings: monitoring } = useMonitoringSettings();
  useSecuritySettings();

  const [selected, setSelected] = useState<string | undefined>();
  const chartServer = selected ?? servers[0]?.id;

  const time = now.toLocaleTimeString('es-CO', { hour12: false });
  const onlineCount = liveOnlineCount;

  /* Salud por servidor: misma fuente que la lista (`useServersLive`), para que
     las dos pantallas no digan cosas distintas del mismo servidor. Antes leía
     `metadata.cpu`, que nadie escribe, y pintaba 0 % en cuanto callaba el
     WebSocket. */
  const health = useMemo(() => {
    return servers
      .map(s => {
        const rt = runtime[s.id];
        const cpu = rt?.cpu ?? 0;
        const memory = rt?.memory ?? 0;
        const disk = rt?.disk ?? 0;
        return {
          id: s.id,
          name: s.name,
          host: s.host,
          os: s.osVersion ?? s.os,
          status: rt?.state ?? s.status,
          lastSeen: s.lastSeen ?? null,
          cpu, memory, disk,
          worst: Math.max(cpu, memory, disk),
          hasData: Boolean(rt?.hasMetrics),
        };
      })
      .sort((a, b) => b.worst - a.worst);
  }, [servers, runtime]);

  const atRisk = health.filter(h => h.hasData && h.disk >= monitoring.diskThreshold);
  const silent = health.filter(h => h.status !== 'online');
  const lastReport = overview?.lastReportAt ?? null;

  return (
    <div className="h-full min-h-0 flex flex-col gap-5">
      {/* ── Cabecera ── */}
      <Card className="px-6 py-5 flex items-center gap-4 shrink-0">
        <div className="w-14 h-14 rounded-2xl grad-brand flex items-center justify-center elev-brand shrink-0">
          {icons.server}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Panel de Control</h1>
          <p className="text-sm text-white/55 mt-0.5">
            {lastReport
              ? `Último reporte del agente ${timeAgo(lastReport)}`
              : 'Sin reportes del agente todavía'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase tracking-wider text-white/45 font-medium">Hora actual</div>
            <div className="font-mono text-base text-white/95 tabular-nums">{time}</div>
          </div>
          <button
            onClick={() => navigate(ROUTES.NOTIFICATIONS)}
            aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
            title={unreadCount > 0 ? `${unreadCount} sin leer` : 'Notificaciones'}
            className="mo-tab w-11 h-11 rounded-xl glass-soft text-white/75 hover:text-white row-hit flex items-center justify-center relative"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 004 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-pink-400 ring-2 ring-[var(--bg-mid)]" />
            )}
          </button>
        </div>
      </Card>

      {/* ── Única zona con scroll ── */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-area space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <Kpi label="Servidores Online" value={`${onlineCount}/${servers.length}`}
            accent="text-emerald-300" tone="emerald"
            sub={overview ? `${overview.reporting} con métricas` : undefined}
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-emerald-300"><circle cx="12" cy="12" r="9" /><path d="M8 12l2.5 2.5L16 9.5" /></svg>} />
          <Kpi label="Servicios" value={overview?.services ?? '—'} tone="violet"
            sub={overview ? `${overview.processes} procesos` : 'sin datos'}
            icon={icons.stack} />
          <Kpi label="Sitios Web" value={overview?.websites ?? '—'} tone="sky"
            sub={overview && overview.websites === 0 ? 'ninguno detectado' : undefined}
            icon={icons.globe} />
          <Kpi label="Bases de Datos" value={overview?.databases ?? '—'} tone="amber"
            sub={overview && overview.databases === 0 ? 'ninguna detectada' : undefined}
            icon={icons.database} />
        </div>

        {/* Gráfica 24 h */}
        <Card className="p-5">
          <SectionTitle
            right={
              servers.length > 1 ? (
                <div className="glass-input rounded-xl h-9 flex items-center px-3">
                  <select
                    value={chartServer ?? ''}
                    onChange={e => setSelected(e.target.value)}
                    className="bg-transparent outline-none text-sm text-white/90 pr-1"
                  >
                    {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              ) : (
                <span className="text-xs text-white/40">
                  {servers[0]?.name ?? ''}
                </span>
              )
            }
          >
            CPU y memoria · últimas 24 h
          </SectionTitle>

          {servers.length === 0 ? (
            <Empty title="Sin servidores registrados"
              hint="Agrega un servidor para empezar a recopilar métricas." />
          ) : (
            <>
              <HistoryChart
                serverId={chartServer}
                cpuThreshold={monitoring.cpuThreshold}
                memoryThreshold={monitoring.memoryThreshold}
              />
              <div className="flex items-center gap-4 mt-3 text-xs text-white/45 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full" style={{ background: 'var(--brand-1)' }} /> CPU
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full" style={{ background: 'var(--brand-2)' }} /> Memoria
                </span>
                <span className="flex items-center gap-1.5 ml-auto">
                  <span className="w-3 border-t border-dashed border-amber-400/70" />
                  umbrales de alerta ({monitoring.cpuThreshold}% / {monitoring.memoryThreshold}%)
                </span>
              </div>
            </>
          )}
        </Card>

        {/* Salud por servidor */}
        <Card className="p-5">
          <SectionTitle right={<span className="text-xs text-white/40">ordenado por carga</span>}>
            Salud por servidor
          </SectionTitle>

          {serversLoading && <div className="py-8 text-center text-sm text-white/40">Cargando…</div>}

          {!serversLoading && health.length === 0 && (
            <Empty title="Sin servidores registrados"
              hint="Cuando agregues uno aparecerá aquí con su CPU, memoria y disco." />
          )}

          <div className="space-y-2.5">
            {health.map(h => (
              <button
                key={h.id}
                onClick={() => navigate(ROUTES.SERVERS)}
                className="mo-tab w-full glass-soft rounded-xl p-4 text-left row-hit"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${h.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <span className="text-sm font-semibold">{h.name}</span>
                  <span className="text-xs text-white/40 font-mono">{h.host}</span>
                  {h.os && <span className="text-xs text-white/35 truncate">{h.os}</span>}
                  <span className="ml-auto text-xs text-white/35">
                    {h.status === 'online' ? 'en línea' : h.lastSeen ? `visto ${timeAgo(h.lastSeen)}` : 'nunca reportó'}
                  </span>
                </div>

                {h.hasData ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                    <MetricBar compact label="CPU" value={h.cpu} />
                    <MetricBar compact label="Memoria" value={h.memory} />
                    <MetricBar compact label="Disco" value={h.disk} />
                  </div>
                ) : (
                  <p className="text-xs text-white/35 mt-2">
                    Sin métricas: el agente de monitoreo no ha reportado en este servidor.
                  </p>
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* Capacidad y avisos */}
        <Card className="p-5">
          <SectionTitle>Capacidad y avisos</SectionTitle>

          {atRisk.length === 0 && silent.length === 0 ? (
            <div className="glass-soft rounded-xl p-4 flex items-center gap-3">
              <span className="text-emerald-300">{icons.check}</span>
              <p className="text-sm text-white/70">
                Nada que reportar: ningún disco por encima del {monitoring.diskThreshold}% y todos los agentes en línea.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {atRisk.map(h => (
                <div key={`disk-${h.id}`} className="glass-soft rounded-xl p-4 flex items-center gap-3 border border-amber-400/20">
                  <span className="text-amber-300 shrink-0">{icons.alert}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{h.name} · disco al {Math.round(h.disk)}%</div>
                    <div className="text-xs text-white/50 mt-0.5">
                      Por encima del umbral configurado ({monitoring.diskThreshold}%).
                    </div>
                  </div>
                  <div className="w-28 shrink-0 hidden sm:block">
                    <div className="h-1.5 rounded-full bg-track overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${barGradient(h.disk)}`}
                        style={{ width: `${Math.min(100, h.disk)}%` }} />
                    </div>
                  </div>
                </div>
              ))}

              {silent.map(h => (
                <div key={`silent-${h.id}`} className="glass-soft rounded-xl p-4 flex items-center gap-3">
                  <span className="text-white/40 shrink-0">{icons.bolt}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{h.name} · sin agente</div>
                    <div className="text-xs text-white/50 mt-0.5">
                      {h.lastSeen ? `Última señal ${timeAgo(h.lastSeen)}.` : 'Nunca ha reportado métricas.'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
