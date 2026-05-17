import { useState, useRef, useEffect } from 'react';

export interface FilterOptions {
  status: string[];
  os: string[];
}

interface SearchFilterProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onClearAll?: () => void;
}

const statusOptions = [
  { value: 'online',       label: 'En línea' },
  { value: 'offline',      label: 'Desconectado' },
  { value: 'error',        label: 'Error' },
  { value: 'maintenance',  label: 'Mantenimiento' },
  { value: 'checking',     label: 'Verificando' },
];

const osOptions = [
  { value: 'ubuntu',   label: 'Ubuntu' },
  { value: 'centos',   label: 'CentOS' },
  { value: 'debian',   label: 'Debian' },
  { value: 'fedora',   label: 'Fedora' },
  { value: 'arch',     label: 'Arch Linux' },
  { value: 'solaris',  label: 'Solaris' },
  { value: 'openbsd',  label: 'OpenBSD' },
  { value: 'netbsd',   label: 'NetBSD' },
  { value: 'freebsd',  label: 'FreeBSD' },
  { value: 'other',    label: 'Otro' },
];

/* ── Inline SVG icons ──────────────────────────────────────────────── */
const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const SearchIcon = () => <svg {...svgProps} className="w-4 h-4"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
const FilterIcon = () => <svg {...svgProps} className="w-4 h-4"><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></svg>;
const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg {...svgProps} className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}>
    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".2"/>
    <path d="M21 12a9 9 0 00-9-9"/>
  </svg>
);
const XIcon = () => <svg {...svgProps} className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12"/></svg>;
const CheckIcon = () => <svg {...svgProps} className="w-3 h-3"><path d="M20 6L9 17l-5-5"/></svg>;

/* ── Checkbox item ─────────────────────────────────────────────────── */
const CheckItem = ({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) => (
  <label className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition">
    <div
      onClick={onToggle}
      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition border ${
        checked ? 'grad-brand border-violet-400/0' : 'border-white/20 bg-transparent'
      }`}
    >
      {checked && <CheckIcon />}
    </div>
    <span className="text-sm text-white/80">{label}</span>
  </label>
);

export const SearchFilter: React.FC<SearchFilterProps> = ({
  searchTerm, onSearchChange, filters, onFiltersChange, onRefresh, isRefreshing = false, onClearAll,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (type: 'status' | 'os', value: string) => {
    const cur = filters[type];
    onFiltersChange({ ...filters, [type]: cur.includes(value) ? cur.filter(f => f !== value) : [...cur, value] });
  };

  const clearFilters = () => onFiltersChange({ status: [], os: [] });
  const clearAll = () => { onSearchChange(''); clearFilters(); onClearAll?.(); };

  const activeCount = filters.status.length + filters.os.length;
  const hasAny = activeCount > 0 || searchTerm.trim().length > 0;

  return (
    <div className="glass-soft rounded-2xl p-4 mb-6 flex items-center gap-3 flex-wrap">
      {/* Search input */}
      <div className="glass-input rounded-xl h-10 flex items-center gap-2 px-3 flex-1 min-w-[200px] transition">
        <span className="text-white/40 shrink-0"><SearchIcon /></span>
        <input
          type="text"
          placeholder="Buscar servidores por nombre o IP…"
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90"
        />
        {searchTerm && (
          <button onClick={() => onSearchChange('')} className="text-white/40 hover:text-white transition shrink-0">
            <XIcon />
          </button>
        )}
      </div>

      {/* Clear all */}
      {hasAny && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl glass-soft text-rose-300 hover:bg-rose-500/10 border border-rose-400/20 text-sm font-medium transition"
        >
          <XIcon /> Limpiar
        </button>
      )}

      {/* Filter dropdown */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-2 h-10 px-3.5 rounded-xl text-sm font-medium border transition ${
            activeCount > 0
              ? 'glass-soft text-violet-300 border-violet-400/25'
              : 'glass-soft text-white/70 hover:text-white border-transparent'
          }`}
        >
          <FilterIcon />
          Filtros
          {activeCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded grad-brand text-white ml-0.5">
              {activeCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-72 glass rounded-xl border border-white/[0.07] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)] z-50 overflow-hidden animate-slideUp">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white">Filtros</span>
              {activeCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-white/45 hover:text-white transition">
                  Limpiar todo
                </button>
              )}
            </div>

            <div className="p-3 max-h-80 overflow-y-auto scroll-thin space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/35 font-semibold px-2 mb-1">Estado</div>
                {statusOptions.map(o => (
                  <CheckItem key={o.value} checked={filters.status.includes(o.value)} label={o.label} onToggle={() => toggle('status', o.value)} />
                ))}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/35 font-semibold px-2 mb-1">Sistema Operativo</div>
                {osOptions.map(o => (
                  <CheckItem key={o.value} checked={filters.os.includes(o.value)} label={o.label} onToggle={() => toggle('os', o.value)} />
                ))}
              </div>
            </div>

            <div className="px-3 pb-3">
              <button
                onClick={() => setOpen(false)}
                className="w-full h-9 rounded-xl grad-brand text-white text-sm font-semibold shadow-[0_4px_14px_-4px_rgba(168,85,247,0.6)] hover:shadow-[0_8px_20px_-6px_rgba(236,72,153,0.55)] transition"
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-2 h-10 px-3.5 rounded-xl grad-brand text-white text-sm font-medium shadow-[0_4px_14px_-4px_rgba(168,85,247,0.55)] hover:shadow-[0_8px_20px_-6px_rgba(236,72,153,0.55)] transition disabled:opacity-50"
      >
        <RefreshIcon spinning={isRefreshing} />
        Actualizar
      </button>
    </div>
  );
};
