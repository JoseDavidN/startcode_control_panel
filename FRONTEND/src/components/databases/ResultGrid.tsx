import React, { useMemo, useRef, useState } from 'react';
import { DbIcon } from '@components/databases/icons';
import { ExportMenu } from '@components/databases/ExportMenu';
import { databasesApi } from '@services/databases.api';
import { copyText } from '@lib/clipboard';
import type { ExportTable } from '@lib/tableExport';
import { maskValue, sensitiveKind } from '@utils/sensitiveColumns';
import type { SensitiveKind } from '@utils/sensitiveColumns';
import type { QueryResult } from '@typings/database.types';

interface ResultGridProps {
  result: QueryResult;
  connectionId: string;
  /** Sesión de la vista: el UPDATE va por la misma conexión. */
  sessionId: string;
  fileName: string;
  /** Resumen de la consulta (filas, truncado) para la barra. */
  status: React.ReactNode;
}

/** Celdas cambiadas y sin guardar: fila → columna → valor nuevo. */
type Pending = Record<number, Record<number, unknown>>;

interface EditingCell {
  r: number;
  c: number;
  draft: string;
}

const display = (value: unknown): string =>
  value === null || value === undefined ? ''
    : typeof value === 'object' ? JSON.stringify(value)
    : String(value as string | number | boolean);

/** TSV como lo pega Excel: con tabulador, salto o comillas, entre comillas. */
const tsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  const text = display(value);
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const errorText = (err: unknown) => (err as { message?: string })?.message ?? 'No se pudo guardar';

const Cell = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return <span className="italic text-white/30">NULL</span>;
  const text = display(value);
  return <span title={text.length > 60 ? text : undefined}>{text}</span>;
};

/** Celda de una columna sensible mientras está oculta. */
const MaskedCell = ({ kind, value }: { kind: SensitiveKind; value: unknown }) => {
  if (value === null || value === undefined) return <span className="italic text-white/30">NULL</span>;
  return (
    <span className="text-white/40 tracking-wider select-none" title="Oculto por seguridad: usa el ojo de la cabecera para verlo">
      {maskValue(kind, value)}
    </span>
  );
};

/* ── Editor de una celda ───────────────────────────────────────────── */
const CellEditor = ({ initial, onCommit, onCancel }: {
  initial: string;
  onCommit: (value: string | null) => void;
  onCancel: () => void;
}) => {
  const [draft, setDraft] = useState(initial);
  /* Enter, Escape y «NULL» ya resolvieron: el blur que viene detrás no debe volver a confirmar. */
  const done = useRef(false);
  const finish = (fn: () => void) => { if (done.current) return; done.current = true; fn(); };

  return (
    <div className="flex items-center gap-1 min-w-[160px]">
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); finish(() => onCommit(draft)); }
          if (e.key === 'Escape') { e.preventDefault(); finish(onCancel); }
        }}
        onBlur={() => finish(() => onCommit(draft))}
        className="flex-1 min-w-0 h-6 px-1.5 rounded bg-tint-sunken text-white outline-none ring-1 ring-violet-400/60 font-mono text-xs"
      />
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => finish(() => onCommit(null))}
        title="Dejar en NULL"
        className="h-6 px-1.5 rounded text-[10px] font-semibold text-white/50 hover:text-white hover:bg-tint-hover"
      >
        NULL
      </button>
    </div>
  );
};

/**
 * Tabla de resultados con selección de filas para copiar y edición en línea.
 * Se monta con `key` por resultado: una consulta nueva arranca sin selección,
 * sin columnas reveladas y sin cambios pendientes.
 *
 * - Clic en `#`: todas las filas. Clic en un número: esa fila (Ctrl/⌘ suma,
 *   Mayús elige un rango). Ctrl/⌘ + C o «Copiar» las copian como TSV.
 * - Doble clic en una celda editable la edita; la fila muestra guardar y
 *   cancelar, y guardar hace un UPDATE por clave primaria de esa fila.
 */
export const ResultGrid: React.FC<ResultGridProps> = ({ result, connectionId, sessionId, fileName, status }) => {
  const columns = useMemo(() => result.columns ?? [], [result.columns]);
  const meta = result.columnMeta ?? [];
  const sensitive = useMemo(() => columns.map(sensitiveKind), [columns]);

  /* Copia local: las filas guardadas se actualizan aquí sin volver a consultar. */
  const [rows, setRows] = useState<unknown[][]>(result.rows);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [pending, setPending] = useState<Pending>({});
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  const say = (text: string) => {
    setFlash(text);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2200);
  };

  const isHidden = (c: number) => Boolean(sensitive[c]) && !revealed.has(c);
  const canEdit = (c: number) => Boolean(meta[c]?.editable) && !isHidden(c);
  const valueAt = (r: number, c: number) => (pending[r] && c in pending[r] ? pending[r][c] : rows[r][c]);
  /* Lo que se ve: con las columnas ocultas, enmascarado. */
  const shownAt = (r: number, c: number) => {
    const v = valueAt(r, c);
    const kind = sensitive[c];
    return kind && isHidden(c) && v !== null && v !== undefined ? maskValue(kind, v) : v;
  };

  const pendingRows = Object.keys(pending).length;
  const hiddenCount = sensitive.filter((k, c) => k && !revealed.has(c)).length;
  const allSelected = rows.length > 0 && selected.size === rows.length;

  /* ── Selección ── */
  const selectAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((_, i) => i)));
    setAnchor(null);
  };

  const selectRow = (r: number, e: React.MouseEvent) => {
    if (e.shiftKey && anchor !== null) {
      const [a, b] = anchor < r ? [anchor, r] : [r, anchor];
      setSelected(new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i)));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(r)) next.delete(r); else next.add(r);
      setSelected(next);
    } else {
      setSelected(selected.size === 1 && selected.has(r) ? new Set() : new Set([r]));
    }
    setAnchor(r);
  };

  const copySelection = async () => {
    if (selected.size === 0) return;
    const indices = [...selected].sort((a, b) => a - b);
    const lines = indices.map(r => columns.map((_, c) => tsvCell(shownAt(r, c))).join('\t'));
    /* Con todo seleccionado va la cabecera: pegado en una hoja queda la tabla entera. */
    if (allSelected) lines.unshift(columns.map(tsvCell).join('\t'));
    try {
      await copyText(lines.join('\n'));
      say(indices.length === 1 ? 'Fila copiada' : `${indices.length} filas copiadas`);
    } catch {
      say('No se pudo copiar al portapapeles');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selected.size > 0) {
      /* Si hay texto seleccionado con el ratón, se copia ese texto como siempre. */
      if (window.getSelection()?.toString()) return;
      e.preventDefault();
      void copySelection();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(rows.map((_, i) => i)));
    } else if (e.key === 'Escape') {
      setSelected(new Set());
    }
  };

  /* ── Edición ── */
  const startEdit = (r: number, c: number) => {
    if (saving.has(r)) return;
    if (!canEdit(c)) {
      /* Resultado sin metadatos: viene de un backend anterior a la edición o de
         una consulta lanzada antes de actualizarlo. Basta con repetirla. */
      if (!result.columnMeta) say('Vuelve a ejecutar la consulta para poder editar este resultado');
      else if (isHidden(c) && meta[c]?.editable) say('Muestra la columna con el ojo para editarla');
      else if (result.readOnlyReason) say(result.readOnlyReason);
      else if (!meta[c]?.editable) say('Esta columna no se puede editar: es un cálculo o su tabla no tiene la clave primaria en el resultado');
      return;
    }
    setEditing({ r, c, draft: display(valueAt(r, c)) });
  };

  const commitEdit = (value: string | null) => {
    if (!editing) return;
    const { r, c } = editing;
    const original = rows[r][c];
    setPending(prev => {
      const row = { ...(prev[r] ?? {}) };
      /* Volver al valor original no es un cambio. */
      const same = value === null ? original === null : original !== null && display(original) === value;
      if (same) delete row[c]; else row[c] = value;
      const next = { ...prev };
      if (Object.keys(row).length) next[r] = row; else delete next[r];
      return next;
    });
    setEditing(null);
  };

  const cancelRow = (r: number) => {
    setPending(prev => { const next = { ...prev }; delete next[r]; return next; });
    setRowErrors(prev => { const next = { ...prev }; delete next[r]; return next; });
  };

  /* Un UPDATE por tabla de origen (en un JOIN la fila puede tocar varias),
     con la clave primaria de los valores originales de la fila. */
  const saveRow = async (r: number) => {
    const changes = pending[r];
    if (!changes) return;
    setSaving(prev => new Set(prev).add(r));
    setRowErrors(prev => { const next = { ...prev }; delete next[r]; return next; });

    const bySource = new Map<string, number[]>();
    for (const c of Object.keys(changes).map(Number)) {
      const source = meta[c]?.source;
      if (source) bySource.set(source, [...(bySource.get(source) ?? []), c]);
    }

    const saved: number[] = [];
    try {
      for (const [source, cols] of bySource) {
        const keyIdx = result.tableKeys?.[source] ?? [];
        const first = meta[cols[0]];
        await databasesApi.updateRow(connectionId, sessionId, {
          schema: first.schema ?? '',
          ...(first.namespace ? { namespace: first.namespace } : {}),
          table: first.table ?? '',
          key: Object.fromEntries(keyIdx.map(k => [meta[k].column ?? '', rows[r][k]])),
          changes: Object.fromEntries(cols.map(c => [meta[c].column ?? '', changes[c]])),
        });
        saved.push(...cols);
      }
      say(`Fila ${r + 1} guardada`);
    } catch (err) {
      setRowErrors(prev => ({ ...prev, [r]: errorText(err) }));
    } finally {
      if (saved.length) {
        setRows(prev => prev.map((row, i) => (i === r ? row.map((v, c) => (saved.includes(c) ? changes[c] : v)) : row)));
        setPending(prev => {
          const left = { ...(prev[r] ?? {}) };
          saved.forEach(c => delete left[c]);
          const next = { ...prev };
          if (Object.keys(left).length) next[r] = left; else delete next[r];
          return next;
        });
      }
      setSaving(prev => { const next = new Set(prev); next.delete(r); return next; });
    }
  };

  const exportTable = (): ExportTable => ({
    columns,
    rows: rows.map((_, r) => columns.map((__, c) => shownAt(r, c))),
  });

  const toggleReveal = (c: number) => setRevealed(prev => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });

  const errorCount = Object.keys(rowErrors).length;

  return (
    <>
      {/* ── Barra ── */}
      <div className="flex items-center justify-between gap-3 px-5 h-11 border-b border-line text-xs shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="font-semibold uppercase tracking-wider text-white/40">Resultados</h3>
          {status}
          {result.readOnlyReason && (
            <span className="text-white/35 truncate" title={result.readOnlyReason}>· {result.readOnlyReason}</span>
          )}
          {pendingRows > 0 && (
            <span className="text-amber-300 shrink-0">
              · {pendingRows} {pendingRows === 1 ? 'fila con cambios' : 'filas con cambios'} sin guardar
            </span>
          )}
          {errorCount > 0 && <span className="text-rose-300 shrink-0">· {errorCount} con error</span>}
          {flash && <span className="text-emerald-300 shrink-0 animate-fadeIn">· {flash}</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {selected.size > 0 && (
            <button type="button" onClick={() => void copySelection()}
              title="Copiar las filas seleccionadas (Ctrl + C)"
              className="mo-tab inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg grad-brand-soft border border-hairline text-white/85 hover:text-white text-xs font-medium">
              <DbIcon name="copy" className="w-3.5 h-3.5" />
              Copiar {selected.size} {selected.size === 1 ? 'fila' : 'filas'}
            </button>
          )}
          <span className="font-mono tabular-nums text-white/40">{result.durationMs} ms</span>
          <ExportMenu result={result} fileName={fileName} getTable={exportTable} hiddenCount={hiddenCount} />
        </div>
      </div>

      {/* ── Tabla ── */}
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Resultados de la consulta"
        className="flex-1 min-h-0 overflow-auto scroll-area scroll-layer outline-none"
      >
        {/* `w-max`: la tabla mide lo que su contenido, y si no cabe, el contenedor
            desplaza en horizontal además de en vertical. */}
        <table className="data-table w-max min-w-full text-xs font-mono border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 sticky-cell p-0 h-9 border-b border-r border-line">
                <button type="button" onClick={selectAll}
                  title={allSelected ? 'Quitar la selección' : 'Seleccionar todas las filas para copiarlas'}
                  className={`w-full h-full px-3 text-right font-normal transition-colors ${allSelected ? 'text-violet-300' : 'text-white/30 hover:text-white'}`}>
                  #
                </button>
              </th>
              {columns.map((col, i) => (
                <th key={i} className="sticky top-0 z-10 sticky-cell px-3 h-9 text-left text-white/70 font-semibold whitespace-nowrap border-b border-line">
                  <span className="inline-flex items-center gap-1.5">
                    {col}
                    {meta[i]?.editable && (
                      <span className="text-white/25" title="Editable: doble clic en una celda"><DbIcon name="edit" className="w-3 h-3" /></span>
                    )}
                    {sensitive[i] && (
                      <button
                        type="button"
                        onClick={() => toggleReveal(i)}
                        aria-pressed={!isHidden(i)}
                        aria-label={isHidden(i) ? `Mostrar ${col}` : `Ocultar ${col}`}
                        title={isHidden(i)
                          ? `Mostrar ${sensitive[i] === 'email' ? 'los correos' : 'los valores'} (oculto por seguridad)`
                          : 'Ocultar de nuevo'}
                        className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors
                          ${isHidden(i) ? 'text-amber-300 hover:bg-tint-hover' : 'text-white/45 hover:text-white hover:bg-tint-hover'}`}
                      >
                        <DbIcon name={isHidden(i) ? 'eyeOff' : 'view'} className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const dirty = pending[r];
              const rowError = rowErrors[r];
              const isSaving = saving.has(r);
              return (
                <tr key={r} className={selected.has(r) ? 'row-selected' : undefined}>
                  <td className="sticky left-0 sticky-cell p-0 h-8 border-b border-r border-line">
                    <div className="flex items-center justify-end h-full">
                      {(dirty || rowError) && (
                        <div className="flex items-center gap-0.5 pl-1.5">
                          <button type="button" onClick={() => void saveRow(r)} disabled={isSaving || !dirty}
                            title={rowError ? `Error: ${rowError}. Reintentar` : 'Guardar los cambios de esta fila'}
                            className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-40
                              ${rowError ? 'text-rose-300 hover:bg-rose-500/15' : 'text-emerald-300 hover:bg-emerald-500/15'}`}>
                            {isSaving
                              ? <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                              : <DbIcon name={rowError ? 'alert' : 'check'} className="w-3.5 h-3.5" />}
                          </button>
                          <button type="button" onClick={() => cancelRow(r)} disabled={isSaving}
                            title="Descartar los cambios de esta fila"
                            className="w-6 h-6 rounded-md flex items-center justify-center text-white/45 hover:text-white hover:bg-tint-hover transition-colors disabled:opacity-40">
                            <DbIcon name="close" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <button type="button" onClick={e => selectRow(r, e)}
                        title="Seleccionar la fila (Ctrl/⌘ suma, Mayús elige un rango)"
                        className={`h-full px-3 text-right tabular-nums transition-colors ${selected.has(r) ? 'text-violet-300' : 'text-white/25 hover:text-white'}`}>
                        {r + 1}
                      </button>
                    </div>
                  </td>
                  {row.map((_, c) => {
                    const isEditing = editing?.r === r && editing.c === c;
                    const isDirty = dirty !== undefined && c in dirty;
                    const value = valueAt(r, c);
                    return (
                      <td key={c}
                        onDoubleClick={() => startEdit(r, c)}
                        className={`px-3 h-8 text-white/80 whitespace-nowrap border-b border-line ${isDirty ? 'cell-dirty' : ''} ${canEdit(c) ? 'cursor-text' : ''}`}>
                        {isEditing ? (
                          <CellEditor initial={editing.draft} onCommit={commitEdit} onCancel={() => setEditing(null)} />
                        ) : (
                          /* El tope va en un div: en una celda de tabla max-width no se respeta. */
                          <div className="max-w-[320px] truncate">
                            {isHidden(c) ? <MaskedCell kind={sensitive[c]!} value={value} /> : <Cell value={value} />}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};
