import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MetricBar } from '@components/common/MetricBar';
import { FileGlyph } from '@components/cloud/icons';
import { CLOUD_SECTIONS, CLOUD_TYPE_FILTERS, formatBytes } from '@utils/cloud';
import type { CloudFileType, CloudStats, CloudStorage } from '@typings/cloud.types';
import { Empty } from '@components/dashboard/DashboardParts';
import { AXIS_STYLE, AXIS_TICK, TOOLTIP_CURSOR, TOOLTIP_LABEL_STYLE, TOOLTIP_STYLE } from '@components/dashboard/chartStyles';

/* Tarjetas de Cloud del dashboard. Los datos salen de `GET /stats` de la
   nube (resumen ya agregado) y de `GET /storage` (disco). Una sola serie por
   gráfica y un solo eje: el color es el de la marca del tema y la identidad
   va siempre en texto. */

const TYPE_LABEL = new Map(CLOUD_TYPE_FILTERS) as Map<string, string>;
const typeLabel = (t: CloudFileType) => TYPE_LABEL.get(t) ?? t;
const files = (n: number) => `${n.toLocaleString('es-CO')} ${n === 1 ? 'archivo' : 'archivos'}`;

const CloudIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <path d="M7 18h10a4 4 0 00.6-7.96A6 6 0 006.2 9.1 4.5 4.5 0 007 18z" />
  </svg>
);

/** Lo que muestra una tarjeta de Cloud cuando no hay datos que pintar. */
export type CloudCardState =
  | { kind: 'ready'; stats: CloudStats }
  | { kind: 'loading' }
  | { kind: 'empty'; title: string; hint: string };

/* Sin datos: carga o estado vacío con el motivo (sin conectar, nube antigua…). */
const NotReady = ({ state, height }: { state: Exclude<CloudCardState, { kind: 'ready' }>; height: string }) =>
  state.kind === 'loading'
    ? <div className={`${height} flex items-center justify-center text-sm text-white/40`}>Leyendo la nube…</div>
    : <Empty title={state.title} hint={state.hint} icon={<CloudIcon />} />;

/* ── Almacenamiento: disco y reparto entre Home y Backups ─────────── */
export const CloudStorageCard = ({ storage, state }: { storage: CloudStorage | undefined; state: CloudCardState }) => {
  if (state.kind !== 'ready') return <NotReady state={state} height="h-[200px]" />;
  const { sections } = state.stats;
  const used = storage && storage.total > 0 ? (storage.used / storage.total) * 100 : null;
  const total = sections.home.bytes + sections.backups.bytes;
  return (
    <div className="space-y-5">
      {storage && used !== null && (
        <div>
          <MetricBar label="Disco de la nube" value={used} />
          <p className="text-xs text-white/45 mt-1.5 tabular-nums">
            {formatBytes(storage.used)} de {formatBytes(storage.total)} · {formatBytes(Math.max(0, storage.total - storage.used))} libres
          </p>
        </div>
      )}
      <div className="space-y-2.5">
        {CLOUD_SECTIONS.map(({ id, label }) => {
          const s = sections[id];
          const share = total > 0 ? (s.bytes / total) * 100 : 0;
          return (
            <div key={id} className="glass-soft rounded-xl px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-white/85">{label}</span>
                <span className="text-sm font-mono font-semibold tabular-nums text-white">{formatBytes(s.bytes)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-1 text-xs text-white/45 tabular-nums">
                <span>{files(s.files)}</span>
                <span>{Math.round(share)}% de lo guardado</span>
              </div>
            </div>
          );
        })}
      </div>
      {state.stats.truncated && (
        <p className="text-[11px] text-amber-300/80">Hay más archivos de los que la nube recorre: las cifras se quedan cortas.</p>
      )}
    </div>
  );
};

/* ── Actividad: archivos nuevos o modificados por día, 30 días ────── */
const ACTIVITY_MARGIN = { top: 8, right: 4, bottom: 0, left: -24 };
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
const fmtDayLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

const ActivityTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: CloudStats['activity'][number] }[] }) => {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <div style={TOOLTIP_LABEL_STYLE} className="first-letter:uppercase">{fmtDayLong(p.date)}</div>
      <div className="text-white/70">{p.files ? `${files(p.files)} · ${formatBytes(p.bytes)}` : 'Sin cambios'}</div>
    </div>
  );
};

export const CloudActivityChart = memo(({ state }: { state: CloudCardState }) => {
  if (state.kind !== 'ready') return <NotReady state={state} height="h-[240px]" />;
  const data = state.stats.activity;
  const total = data.reduce((n, d) => n + d.files, 0);
  if (total === 0) {
    return <Empty title="Sin actividad en 30 días" hint="Aquí se ven, día a día, los archivos que se cargan o se modifican en Home y Backups." icon={<CloudIcon />} />;
  }
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={ACTIVITY_MARGIN} barCategoryGap={2}>
          <defs>
            <linearGradient id="gCloudActivity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-2)" />
              <stop offset="100%" stopColor="var(--brand-1)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--hairline-soft)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={24} tickLine={false} axisLine={false}
            tick={AXIS_TICK} style={AXIS_STYLE} className="text-white/40" />
          <YAxis allowDecimals={false} width={40} tickLine={false} axisLine={false}
            tick={AXIS_TICK} style={AXIS_STYLE} className="text-white/40" />
          <Tooltip content={<ActivityTooltip />} cursor={TOOLTIP_CURSOR} />
          <Bar dataKey="files" name="Archivos" fill="url(#gCloudActivity)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
CloudActivityChart.displayName = 'CloudActivityChart';

/* ── Espacio por tipo de archivo: barras horizontales, de mayor a menor ── */
const TYPES_MARGIN = { top: 0, right: 64, bottom: 0, left: 0 };
const TYPES_LABEL_STYLE = { fill: 'currentColor', fontSize: 11 };

const TypesTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: CloudStats['byType'][number] }[] }) => {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <div style={TOOLTIP_LABEL_STYLE}>{typeLabel(p.type)}</div>
      <div className="text-white/70">{formatBytes(p.bytes)} · {files(p.files)}</div>
    </div>
  );
};

export const CloudTypesChart = memo(({ state }: { state: CloudCardState }) => {
  const data = useMemo(
    () => (state.kind === 'ready' ? state.stats.byType.map(t => ({ ...t, label: typeLabel(t.type) })) : []),
    [state],
  );
  if (state.kind !== 'ready') return <NotReady state={state} height="h-[240px]" />;
  if (data.length === 0) {
    return <Empty title="La nube está vacía" hint="Cuando cargues archivos verás aquí cuánto ocupa cada tipo." icon={<CloudIcon />} />;
  }
  /* Alto según el número de tipos: barras de grosor parecido con 2 o con 10. */
  const height = Math.max(120, data.length * 30 + 8);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={TYPES_MARGIN} barCategoryGap={4}>
          <defs>
            <linearGradient id="gCloudTypes" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--brand-1)" />
              <stop offset="100%" stopColor="var(--brand-2)" />
            </linearGradient>
          </defs>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={96} tickLine={false} axisLine={false}
            tick={AXIS_TICK} style={AXIS_STYLE} className="text-white/60" />
          <Tooltip content={<TypesTooltip />} cursor={TOOLTIP_CURSOR} />
          <Bar dataKey="bytes" name="Tamaño" fill="url(#gCloudTypes)" radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList dataKey="bytes" position="right" formatter={(v: number) => formatBytes(v)} style={TYPES_LABEL_STYLE} className="text-white/55" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
CloudTypesChart.displayName = 'CloudTypesChart';

/* ── Archivos más grandes ─────────────────────────────────────────── */
export const CloudLargestFiles = ({ state, onOpen }: { state: CloudCardState; onOpen: () => void }) => {
  if (state.kind !== 'ready') return <NotReady state={state} height="h-[160px]" />;
  const list = state.stats.largest;
  if (list.length === 0) return <p className="text-sm text-white/45">Todavía no hay archivos en la nube.</p>;
  return (
    <ul className="space-y-1">
      {list.map(f => (
        <li key={`${f.section}:${f.id}`}>
          <button type="button" onClick={onOpen} title={`${f.id} · ${CLOUD_SECTIONS.find(s => s.id === f.section)?.label ?? f.section}`}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-tint-hover transition-colors">
            <FileGlyph type={f.type} size="sm" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-white/85 truncate">{f.name}</span>
              <span className="block text-[11px] text-white/40">{CLOUD_SECTIONS.find(s => s.id === f.section)?.label}</span>
            </span>
            <span className="text-xs font-mono tabular-nums text-white/70 shrink-0">{formatBytes(f.size)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

/* Título pequeño con la fecha del resumen, para el lado derecho de las tarjetas. */
export const StatsAge = ({ state }: { state: CloudCardState }): ReactNode =>
  state.kind === 'ready'
    ? <span className="text-xs text-white/40">al {new Date(state.stats.generatedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
    : null;
