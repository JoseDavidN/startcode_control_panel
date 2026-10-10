import { useEffect, useRef, useState } from 'react';
import { downloadBlob } from '@lib/download';
import { sheetThemeFromCss, toCsv, toXlsx } from '@lib/tableExport';
import type { ExportTable } from '@lib/tableExport';
import { DbIcon } from '@components/databases/icons';
import type { QueryResult } from '@typings/database.types';

/* ── Exportar: CSV o XLSX de las filas recibidas ──────────────────── */
export const ExportMenu = ({ result, fileName, getTable, hiddenCount }: {
  result: QueryResult;
  fileName: string;
  /** La tabla tal como se ve: columnas sensibles ocultas, enmascaradas. */
  getTable: () => ExportTable;
  hiddenCount: number;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const exportAs = (format: 'csv' | 'xlsx') => {
    const table = getTable();
    /* El XLSX toma los colores del tema activo en el momento de exportar. */
    downloadBlob(
      format === 'csv' ? toCsv(table) : toXlsx(table, 'Resultados', sheetThemeFromCss()),
      `${fileName}.${format}`,
    );
    setOpen(false);
  };

  const item = 'w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-left text-xs text-white/75 hover:text-white hover:bg-tint-hover';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={result.truncated ? `Exporta las ${result.rows.length} filas mostradas` : undefined}
        className="mo-tab inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg glass-soft row-hit text-white/75 hover:text-white text-xs font-medium"
      >
        <DbIcon name="download" className="w-3.5 h-3.5" />
        Exportar
        <DbIcon name="chevronDown" className="w-3 h-3" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 z-30 w-44 p-1 rounded-xl glass-float elev-float border border-hairline animate-fadeIn">
          <button type="button" role="menuitem" onClick={() => exportAs('csv')} className={item}>
            <span className="font-mono text-[10px] font-semibold w-9 text-center rounded-md px-1 py-0.5 bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20">CSV</span>
            Texto separado por comas
          </button>
          <button type="button" role="menuitem" onClick={() => exportAs('xlsx')} className={item}>
            <span className="font-mono text-[10px] font-semibold w-9 text-center rounded-md px-1 py-0.5 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">XLSX</span>
            Libro de Excel
          </button>
          {hiddenCount > 0 && (
            <p className="px-3 pt-1.5 pb-1 text-[10px] leading-snug text-white/40 border-t border-line mt-1">
              {hiddenCount === 1 ? 'La columna oculta se exporta enmascarada' : `Las ${hiddenCount} columnas ocultas se exportan enmascaradas`}; muéstrala para exportar su valor.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
