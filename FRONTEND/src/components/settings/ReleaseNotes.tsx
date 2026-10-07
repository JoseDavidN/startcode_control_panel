import React, { useMemo, useState } from 'react';
import {
  compareVersions,
  useReleaseNotes,
  type ChangeSection,
  type ReleaseEntry,
  type ReleaseType,
} from '@hooks/useReleaseNotes';

interface Props {
  /** Versión instalada; '—' fuera de Tauri. */
  installedVersion: string;
}

const TYPE_META: Record<ReleaseType, { label: string; tone: string }> = {
  major: { label: 'Mayor', tone: 'bg-rose-500/15 text-rose-300 ring-rose-400/20' },
  minor: { label: 'Menor', tone: 'bg-violet-500/15 text-violet-300 ring-violet-400/20' },
  patch: { label: 'Parche', tone: 'bg-sky-500/15 text-sky-300 ring-sky-400/20' },
};

const SECTION_META: Record<ChangeSection, { label: string; dot: string }> = {
  added: { label: 'Novedades', dot: 'bg-emerald-400' },
  changed: { label: 'Cambios', dot: 'bg-sky-400' },
  fixed: { label: 'Correcciones', dot: 'bg-amber-400' },
  removed: { label: 'Eliminado', dot: 'bg-white/40' },
  security: { label: 'Seguridad', dot: 'bg-rose-400' },
};
const SECTIONS = Object.keys(SECTION_META) as ChangeSection[];

const FILTERS: { id: ReleaseType | 'all'; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'major', label: 'Mayores' },
  { id: 'minor', label: 'Menores' },
  { id: 'patch', label: 'Parches' },
];

const COLLAPSED = 4;

const fmtDate = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Release = ({ entry, installed }: { entry: ReleaseEntry; installed: string }) => {
  const isInstalled = entry.version === installed;
  const isNewer = installed !== '—' && compareVersions(entry.version, installed) > 0;
  const meta = TYPE_META[entry.type] ?? TYPE_META.patch;

  return (
    <div className={`glass-soft rounded-xl p-4 ${isNewer ? 'border border-violet-400/25' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-sm font-semibold font-mono text-white">v{entry.version}</span>
        <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 ${meta.tone}`}>
          {meta.label}
        </span>
        {isInstalled && (
          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 bg-emerald-500/15 text-emerald-300 ring-emerald-400/20">
            Instalada
          </span>
        )}
        {isNewer && (
          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 bg-violet-500/15 text-violet-200 ring-violet-400/25">
            Disponible
          </span>
        )}
        <span className="text-xs text-white/40 ml-auto">{fmtDate(entry.date)}</span>
      </div>
      {entry.title && <p className="text-sm text-white/80 mb-3">{entry.title}</p>}

      <div className="space-y-3">
        {SECTIONS.filter(s => entry.changes?.[s]?.length).map(section => (
          <div key={section}>
            <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5">{SECTION_META[section].label}</p>
            <ul className="space-y-1">
              {entry.changes[section]!.map(change => (
                <li key={change} className="flex items-start gap-2 text-xs text-white/70 leading-relaxed">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${SECTION_META[section].dot}`} />
                  {change}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Novedades por versión, agrupadas por tipo de salto (mayor, menor, parche).
 * Las versiones posteriores a la instalada se marcan como disponibles.
 */
export const ReleaseNotes: React.FC<Props> = ({ installedVersion }) => {
  const { versions, remoteError } = useReleaseNotes();
  const [filter, setFilter] = useState<ReleaseType | 'all'>('all');
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(
    () => versions.filter(v => filter === 'all' || v.type === filter),
    [versions, filter],
  );
  const visible = expanded ? filtered : filtered.slice(0, COLLAPSED);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`mo-tab h-8 px-3 rounded-lg text-xs font-medium border
              ${filter === f.id
                ? 'mo-tab-on grad-brand-soft text-white border-hairline'
                : 'glass-soft text-white/60 hover:text-white hover:border-hairline-hover'}`}
          >
            {f.label}
          </button>
        ))}
        {remoteError && (
          <span className="text-[11px] text-white/35 ml-auto" title="No se pudo leer el sitio de releases">
            Sin conexión con el sitio de versiones: se muestran las incluidas en la app
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="edge-dashed rounded-xl py-8 text-center text-sm text-white/45">
          No hay versiones de este tipo.
        </div>
      ) : (
        visible.map(entry => <Release key={entry.version} entry={entry} installed={installedVersion} />)
      )}

      {filtered.length > COLLAPSED && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mo-tab h-9 px-4 rounded-xl glass-soft row-hit text-white/75 hover:text-white text-xs font-medium"
        >
          {expanded ? 'Ver menos' : `Ver todas (${filtered.length})`}
        </button>
      )}
    </div>
  );
};
