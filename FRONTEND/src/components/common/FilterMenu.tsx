import React, { useEffect, useRef, useState } from 'react';

/** Un grupo de filtro de una sola opción. `value` '' es «sin filtro». */
export interface FilterGroup {
  id: string;
  label: string;
  /** Texto de la opción sin filtro («Todos», «Todas»). */
  allLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

const FilterIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M3 5h18l-7 9v6l-4-2v-4L3 5z" />
  </svg>
);

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} aria-pressed={active}
    className={`mo-tab h-8 px-3 rounded-lg text-xs font-medium
      ${active ? 'mo-tab-on grad-brand text-white elev-brand-sm' : 'glass-soft row-hit text-white/70 hover:text-white'}`}>
    {children}
  </button>
);

/**
 * Botón «Filtros» de las barras de búsqueda con su menú desplegable. La
 * tarjeta que lo contiene debe ir con `relative z-20` para que el menú quede
 * por encima de la rejilla que hay debajo.
 */
export const FilterMenu = ({ groups, onClear }: { groups: FilterGroup[]; onClear: () => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = groups.filter(g => g.value).length;

  /* Se cierra al hacer clic fuera o con Escape. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft row-hit text-sm font-medium transition
          ${active ? 'text-white' : 'text-white/85'}`}>
        <FilterIcon /> Filtros
        {active > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full grad-brand text-white text-[11px] font-semibold flex items-center justify-center">
            {active}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-80 glass-float elev-float border border-hairline rounded-xl p-4 space-y-4">
          {groups.map(g => (
            <div key={g.id}>
              <div className="text-xs text-white/55 font-medium mb-2">{g.label}</div>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={!g.value} onClick={() => g.onChange('')}>{g.allLabel}</Chip>
                {g.options.map(o => (
                  <Chip key={o.value} active={g.value === o.value} onClick={() => g.onChange(o.value)}>{o.label}</Chip>
                ))}
              </div>
            </div>
          ))}
          {active > 0 && (
            <div className="flex justify-end pt-1 border-t border-line">
              <button type="button" onClick={onClear}
                className="mt-3 h-8 px-3 rounded-lg text-xs text-white/70 hover:text-white hover:bg-tint-hover transition">
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
