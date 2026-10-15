import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { DbIcon } from '@components/databases/icons';
import { ExportMenu } from '@components/databases/ExportMenu';
import { databasesApi } from '@services/databases.api';
import { copyText } from '@lib/clipboard';
import type { ExportTable } from '@lib/tableExport';
import type { ExportSource } from '@components/databases/ExportMenu';
import { maskValue, sensitiveKind } from '@utils/sensitiveColumns';
import type { SensitiveKind } from '@utils/sensitiveColumns';
import type { InsertColumn, QueryResult, TableRef } from '@typings/database.types';
import { DeleteRowsModal, type DeleteTarget } from '@components/databases/DeleteRowsModal';
import { notify } from '@services/notification.service';

interface ResultGridProps {
  result: QueryResult;
  connectionId: string;
  /** Sesión de la vista: el UPDATE va por la misma conexión. */
  sessionId: string;
  fileName: string;
  /** Consulta que dio el resultado: al exportar se repite para traer todas las filas. */
  query?: { sql: string; schema: string | null };
  /** Resumen de la consulta (filas, truncado) para la barra. */
  status: React.ReactNode;
  /** Vuelve a ejecutar la consulta (tras insertar una fila, para verla). */
  onRerun?: () => void;
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
  /* Si no cabe, el globo de la tabla (`CellTip`) muestra el valor completo. */
  return <span>{display(value)}</span>;
};

/* ── Globo con el contenido completo de una celda cortada (…) ──────── */
interface Tip { text: string; left: number; top?: number; bottom?: number }
const TIP_DELAY = 350;
const TIP_W = 560;

const CellTip = ({ tip, onEnter, onLeave }: { tip: Tip; onEnter: () => void; onLeave: () => void }) => createPortal(
  <div role="tooltip" onMouseEnter={onEnter} onMouseLeave={onLeave}
    className="fixed z-[75] p-3 rounded-xl glass-float elev-float border border-hairline animate-fadeIn max-h-[320px] overflow-auto scroll-thin"
    style={{ left: tip.left, top: tip.top, bottom: tip.bottom, maxWidth: `min(${TIP_W}px, calc(100vw - 16px))` }}>
    <pre className="m-0 text-xs font-mono text-white/85 whitespace-pre-wrap break-words select-text">{tip.text}</pre>
  </div>,
  document.body,
);

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
const CellEditor = ({ initial, onCommit, onCancel, onDefault }: {
  initial: string;
  onCommit: (value: string | null) => void;
  onCancel: () => void;
  /** Solo en filas nuevas con valor por defecto: volver a «Por defecto». */
  onDefault?: () => void;
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
      {onDefault && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => finish(onDefault)}
          title="Dejar que la base ponga su valor por defecto"
          className="h-6 px-1.5 rounded text-[10px] font-semibold text-white/50 hover:text-white hover:bg-tint-hover whitespace-nowrap"
        >
          DEFECTO
        </button>
      )}
    </div>
  );
};

/* ── Filas nuevas (borradores) ─────────────────────────────────────── */
type DraftMode = 'default' | 'null' | 'value';
interface DraftCell { mode: DraftMode; value: string }
interface Draft { id: number; cells: Record<number, DraftCell>; saving: boolean; error: string | null }

/* Tipos donde un texto vacío es un valor válido. */
const TEXT_TYPE = /char|text|json|uuid|enum|set|xml|inet|cidr|bytea|blob|binary/i;

/* Cómo empieza cada celda: por defecto si la columna lo tiene, NULL si lo admite; si no, hay que escribirla. */
const initialDraftCell = (c: InsertColumn): DraftCell =>
  c.auto || c.defaultValue !== null ? { mode: 'default', value: '' }
    : c.nullable ? { mode: 'null', value: '' }
      : { mode: 'value', value: '' };

const defaultText = (c: InsertColumn) => {
  const shown = c.defaultValue ?? c.autoLabel;
  return `Por defecto${shown !== null ? ` (${shown === '' ? 'texto vacío' : shown})` : ''}`;
};

/**
 * Tabla de resultados con selección de filas para copiar y edición en línea.
 * Se monta con `key` por resultado: una consulta nueva arranca sin selección,
 * sin columnas reveladas y sin cambios pendientes.
 *
 * - Clic en `#`: todas las filas. Clic en un número: esa fila (Ctrl/⌘ suma,
 *   Mayús elige un rango). Ctrl/⌘ + C o «Copiar» las copian como TSV.
 * - Clic en una celda la marca; Ctrl/⌘ + C copia su valor tal cual. Las
 *   flechas la mueven y Enter la edita.
 * - Doble clic en una celda editable la edita; la fila muestra guardar y
 *   cancelar, y guardar hace un UPDATE por clave primaria de esa fila.
 */
export const ResultGrid: React.FC<ResultGridProps> = ({ result, connectionId, sessionId, fileName, query, status, onRerun }) => {
  const columns = useMemo(() => result.columns ?? [], [result.columns]);
  const meta = useMemo(() => result.columnMeta ?? [], [result.columnMeta]);
  const sensitive = useMemo(() => columns.map(sensitiveKind), [columns]);

  /* Copia local: las filas guardadas se actualizan aquí sin volver a consultar. */
  const [rows, setRows] = useState<unknown[][]>(result.rows);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  /* Celda marcada con un clic: la que copia Ctrl + C. Excluye la selección de filas. */
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [pending, setPending] = useState<Pending>({});
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  /* Globo de celdas cortadas: uno para toda la tabla, con un manejador delegado
     en el cuerpo (nada por celda). Sale si el texto no cabe (`scrollWidth`),
     tras un instante, y se queda mientras el mouse está en la celda o en el
     globo (para leerlo, desplazarlo o copiar). */
  const [tip, setTip] = useState<Tip | null>(null);
  const tipCell = useRef<HTMLElement | null>(null);
  const tipTimer = useRef<number | undefined>(undefined);
  const hideTip = (delay = 120) => {
    window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => { tipCell.current = null; setTip(null); }, delay);
  };
  const onCellOver = (e: React.MouseEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell-clip');
    if (cell === tipCell.current) { window.clearTimeout(tipTimer.current); return; }
    if (!cell || cell.scrollWidth <= cell.clientWidth + 1) { if (tipCell.current) hideTip(); return; }
    window.clearTimeout(tipTimer.current);
    tipCell.current = cell;
    setTip(null);
    tipTimer.current = window.setTimeout(() => {
      const r = cell.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left - 4, window.innerWidth - Math.min(TIP_W, window.innerWidth - 16) - 8));
      /* Debajo si cabe; si no, encima de la celda. */
      const below = window.innerHeight - r.bottom > 240;
      setTip({ text: cell.textContent ?? '', left, ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) });
    }, TIP_DELAY);
  };
  const onCellOut = (e: React.MouseEvent) => {
    const into = e.relatedTarget as Node | null;
    if (tipCell.current && into && tipCell.current.contains(into)) return;
    if (tipCell.current) hideTip();
  };
  useEffect(() => () => window.clearTimeout(tipTimer.current), []);

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
    setActive(null);
  };

  const selectRow = (r: number, e: React.MouseEvent) => {
    setActive(null);
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

  const selectCell = (r: number, c: number) => {
    setActive({ r, c });
    if (selected.size) setSelected(new Set());
    setAnchor(null);
  };

  /* El valor tal cual (sin comillas de TSV). Una columna oculta no se copia
     enmascarada: hay que mostrarla antes. */
  const copyCell = async ({ r, c }: { r: number; c: number }) => {
    if (!rows[r]) return;
    if (isHidden(c)) { say('Muestra la columna con el ojo para copiar su valor'); return; }
    const value = valueAt(r, c);
    if (value === null || value === undefined) { say('La celda es NULL: no hay nada que copiar'); return; }
    try {
      await copyText(display(value));
      say('Valor copiado');
    } catch {
      say('No se pudo copiar al portapapeles');
    }
  };

  /* Flechas: mueven la celda marcada y la mantienen a la vista. */
  const moveCell = (dr: number, dc: number, host: HTMLElement) => {
    if (!active) return;
    const r = Math.min(rows.length - 1, Math.max(0, active.r + dr));
    const c = Math.min(columns.length - 1, Math.max(0, active.c + dc));
    setActive({ r, c });
    requestAnimationFrame(() =>
      host.querySelector(`[data-cell="${r}:${c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (active && ARROWS[e.key]) {
      e.preventDefault();
      moveCell(...ARROWS[e.key], e.currentTarget);
    } else if (active && e.key === 'Enter') {
      e.preventDefault();
      startEdit(active.r, active.c);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && active) {
      /* Si hay texto seleccionado con el ratón, se copia ese texto como siempre. */
      if (window.getSelection()?.toString()) return;
      e.preventDefault();
      void copyCell(active);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selected.size > 0) {
      /* Si hay texto seleccionado con el ratón, se copia ese texto como siempre. */
      if (window.getSelection()?.toString()) return;
      e.preventDefault();
      void copySelection();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setActive(null);
      setSelected(new Set(rows.map((_, i) => i)));
    } else if (e.key === 'Escape') {
      setSelected(new Set());
      setActive(null);
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
      notify.success(`Fila ${r + 1} guardada`);
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

  /* Si la vista está recortada, el backend repite la consulta y trae todas las
     filas; las columnas ocultas se enmascaran igual que en la tabla. */
  const exportTable = async (): Promise<ExportSource> => {
    if (!result.truncated || !query) {
      return { table: { columns, rows: rows.map((_, r) => columns.map((__, c) => shownAt(r, c))) }, total: rows.length, complete: !result.truncated };
    }
    const full = await databasesApi.exportQuery(connectionId, sessionId, query.sql, query.schema);
    const table: ExportTable = {
      columns,
      rows: full.rows.map(row => columns.map((_, c) => {
        const v = row[c];
        const kind = sensitive[c];
        return kind && isHidden(c) && v !== null && v !== undefined ? maskValue(kind, v) : v;
      })),
    };
    return { table, total: full.rowCount, complete: !full.truncated };
  };

  const toggleReveal = (c: number) => setRevealed(prev => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });

  const errorCount = Object.keys(rowErrors).length;

  /* ── Filas nuevas en línea ──
     Solo con una consulta de una sola tabla (sin JOIN) que traiga todas sus
     columnas: así cada celda de la fila nueva es una columna de la tabla. */
  const insertSources = useMemo(() => [...new Set(meta.map(m => m.source).filter((x): x is string => Boolean(x)))], [meta]);
  const insertRef = useMemo<TableRef | null>(() => {
    if (insertSources.length !== 1) return null;
    const m = meta.find(x => x.source === insertSources[0]);
    return m?.schema && m.table ? { schema: m.schema, table: m.table, ...(m.namespace ? { namespace: m.namespace } : {}) } : null;
  }, [insertSources, meta]);
  const tableCols = useQuery({
    queryKey: ['tableColumns', connectionId, insertRef?.schema, insertRef?.namespace, insertRef?.table],
    queryFn: () => databasesApi.tableColumns(connectionId, sessionId, insertRef!),
    enabled: Boolean(insertRef && sessionId),
    staleTime: 60_000,
    retry: false,
  });
  /* Columna de la tabla que corresponde a cada columna del resultado (las calculadas, ninguna). */
  const colAt = useMemo(() => {
    const byName = new Map((tableCols.data ?? []).map(c => [c.name, c]));
    return columns.map((_, c) => (meta[c]?.source === insertSources[0] && meta[c]?.column ? byName.get(meta[c].column) ?? null : null));
  }, [tableCols.data, columns, meta, insertSources]);
  const missingCols = useMemo(() => {
    const present = new Set(colAt.filter(Boolean).map(c => c!.name));
    return (tableCols.data ?? []).filter(c => !present.has(c.name)).map(c => c.name);
  }, [tableCols.data, colAt]);
  const insertBlock: string | null =
    insertSources.length > 1 ? 'Solo se agregan filas en consultas de una sola tabla: esta trae columnas de varias (JOIN)'
      : !insertRef ? 'El resultado no sale directamente de una tabla'
        : tableCols.isError ? 'No se pudieron leer las columnas de la tabla'
          : missingCols.length ? `La consulta no trae todas las columnas de ${insertRef.table} (faltan ${missingCols.join(', ')}): usa SELECT * para agregar filas`
            : null;
  const canInsert = Boolean(insertRef && tableCols.data && !insertBlock);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const draftSeq = useRef(0);
  const [draftEditing, setDraftEditing] = useState<{ id: number; c: number; draft: string } | null>(null);
  const addDraft = () => {
    const cells: Record<number, DraftCell> = {};
    colAt.forEach((col, c) => { if (col && !col.generated) cells[c] = initialDraftCell(col); });
    setDrafts(prev => [{ id: ++draftSeq.current, cells, saving: false, error: null }, ...prev]);
  };
  const patchDraft = (id: number, patch: Partial<Draft>) => setDrafts(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  const setDraftCell = (id: number, c: number, cell: DraftCell) =>
    setDrafts(prev => prev.map(d => (d.id === id ? { ...d, cells: { ...d.cells, [c]: cell }, error: null } : d)));

  /* Una fila nueva arriba desplaza los índices de todo lo que va por fila. */
  const shiftRowState = () => {
    const shiftKeys = <T,>(o: Record<number, T>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [Number(k) + 1, v])) as Record<number, T>;
    setPending(prev => shiftKeys(prev));
    setRowErrors(prev => shiftKeys(prev));
    setSaving(prev => new Set([...prev].map(r => r + 1)));
    setSelected(prev => new Set([...prev].map(r => r + 1)));
    setAnchor(prev => (prev === null ? null : prev + 1));
    setEditing(prev => (prev ? { ...prev, r: prev.r + 1 } : prev));
  };

  const saveDraft = async (d: Draft) => {
    if (!insertRef) return;
    const missing = colAt.flatMap((col, c) => {
      const cell = d.cells[c];
      if (!col || !cell || col.nullable || col.auto || col.defaultValue !== null) return [];
      return cell.mode !== 'value' || (cell.value === '' && !TEXT_TYPE.test(col.type)) ? [col.name] : [];
    });
    if (missing.length) { patchDraft(d.id, { error: `Falta un valor para ${missing.join(', ')}` }); return; }
    const values: Record<string, unknown> = {};
    colAt.forEach((col, c) => {
      const cell = d.cells[c];
      if (!col || !cell || cell.mode === 'default') return;
      values[col.name] = cell.mode === 'null' ? null : cell.value;
    });
    patchDraft(d.id, { saving: true, error: null });
    try {
      const res = await databasesApi.insertRow(connectionId, sessionId, { ...insertRef, values });
      setDrafts(prev => prev.filter(x => x.id !== d.id));
      if (res.row) {
        const inserted = res.row;
        shiftRowState();
        setRows(prev => [columns.map((_, c) => (colAt[c] ? inserted[colAt[c].name] ?? null : null)), ...prev]);
        notify.success('Fila creada');
      } else {
        /* Sin clave para leerla de vuelta: se repite la consulta. */
        notify.success('Fila creada');
        onRerun?.();
      }
    } catch (err) {
      patchDraft(d.id, { saving: false, error: errorText(err) });
    }
  };

  /* Borrar las filas seleccionadas: en cada tabla con su clave primaria en el resultado,
     la clave de cada fila sale de sus valores (los guardados, no los cambios pendientes). */
  const [deleting, setDeleting] = useState<DeleteTarget[] | null>(null);
  const deleteTargets = (): DeleteTarget[] => {
    const indices = [...selected].sort((a, b) => a - b);
    return Object.entries(result.tableKeys ?? {}).flatMap(([source, keyIdx]) => {
      const first = meta[keyIdx[0]];
      if (!first?.schema || !first.table || keyIdx.some(k => !meta[k]?.column)) return [];
      return [{
        id: source,
        ref: { schema: first.schema, table: first.table, ...(first.namespace ? { namespace: first.namespace } : {}) },
        keys: indices.map(r => Object.fromEntries(keyIdx.map(k => [meta[k].column!, rows[r][k]]))),
      }];
    });
  };
  const canDelete = Object.keys(result.tableKeys ?? {}).length > 0;

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
          {selected.size > 0 && canDelete && (
            <button type="button" onClick={() => setDeleting(deleteTargets())}
              title="Eliminar las filas seleccionadas de su tabla"
              className="mo-tab inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium">
              <DbIcon name="trash" className="w-3.5 h-3.5" />
              Eliminar {selected.size} {selected.size === 1 ? 'fila' : 'filas'}
            </button>
          )}
          {selected.size > 0 && (
            <button type="button" onClick={() => void copySelection()}
              title="Copiar las filas seleccionadas (Ctrl + C)"
              className="mo-tab inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg grad-brand-soft border border-hairline text-white/85 hover:text-white text-xs font-medium">
              <DbIcon name="copy" className="w-3.5 h-3.5" />
              Copiar {selected.size} {selected.size === 1 ? 'fila' : 'filas'}
            </button>
          )}
          {active && rows[active.r] && (
            <button type="button" onClick={() => void copyCell(active)}
              title={`Copiar el valor de ${columns[active.c]}, fila ${active.r + 1} (Ctrl + C)`}
              className="mo-tab inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg grad-brand-soft border border-hairline text-white/85 hover:text-white text-xs font-medium">
              <DbIcon name="copy" className="w-3.5 h-3.5" />
              Copiar valor
            </button>
          )}
          {insertRef && (
            <button type="button" onClick={addDraft} disabled={!canInsert}
              title={insertBlock ?? (tableCols.isLoading ? 'Leyendo las columnas de la tabla…' : `Agregar una fila en ${insertRef.table}`)}
              className="mo-tab inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg glass-soft row-hit text-white/75 hover:text-white text-xs font-medium disabled:opacity-40">
              <span className="text-sm leading-none">+</span>
              Nueva fila
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
        onScroll={() => { if (tipCell.current) hideTip(0); }}
        onMouseOver={onCellOver}
        onMouseOut={onCellOut}
        className="flex-1 min-h-0 overflow-auto scroll-area scroll-layer outline-none pb-3 pr-3"
      >
        {/* `w-max`: la tabla mide lo que su contenido, y si no cabe, el contenedor
            desplaza en horizontal además de en vertical. `pb-3 pr-3`: los 12 px de
            la franja de las barras propias (overlayScrollbars), para que no tapen
            la última fila ni la última columna. */}
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
            {drafts.map(d => (
              <tr key={`draft-${d.id}`} className="row-new">
                <td className="sticky left-0 sticky-cell p-0 h-8 border-b border-r border-line">
                  <div className="flex items-center justify-end h-full gap-0.5 pl-1.5 pr-2">
                    <button type="button" onClick={() => void saveDraft(d)} disabled={d.saving}
                      title={d.error ? `Error: ${d.error}. Reintentar` : 'Guardar la fila nueva'}
                      className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-40
                        ${d.error ? 'text-rose-300 hover:bg-rose-500/15' : 'text-emerald-300 hover:bg-emerald-500/15'}`}>
                      {d.saving
                        ? <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <DbIcon name={d.error ? 'alert' : 'check'} className="w-3.5 h-3.5" />}
                    </button>
                    <button type="button" onClick={() => setDrafts(prev => prev.filter(x => x.id !== d.id))} disabled={d.saving}
                      title="Descartar la fila nueva"
                      className="w-6 h-6 rounded-md flex items-center justify-center text-white/45 hover:text-white hover:bg-tint-hover transition-colors disabled:opacity-40">
                      <DbIcon name="close" className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300 pl-1" title={d.error ?? 'Fila nueva sin guardar'}>nueva</span>
                  </div>
                </td>
                {columns.map((_, c) => {
                  const col = colAt[c];
                  const cell = d.cells[c];
                  const isEditing = draftEditing?.id === d.id && draftEditing.c === c;
                  if (!col || !cell) {
                    return (
                      <td key={c} className="px-3 h-8 text-white/30 italic whitespace-nowrap border-b border-line"
                        title={col?.generated ? 'Columna generada: la calcula la base' : 'Columna calculada: no se escribe'}>
                        {col?.generated ? 'generada' : '—'}
                      </td>
                    );
                  }
                  return (
                    <td key={c}
                      onDoubleClick={() => setDraftEditing({ id: d.id, c, draft: cell.mode === 'value' ? cell.value : col.defaultValue ?? '' })}
                      title={`${col.name} · ${col.type}${!col.nullable && !col.auto && col.defaultValue === null ? ' · obligatoria' : ''}`}
                      className={`px-3 h-8 whitespace-nowrap border-b border-line cursor-pointer ${cell.mode === 'value' ? 'cell-dirty text-white/85' : 'text-white/40'}`}>
                      {isEditing ? (
                        <CellEditor initial={draftEditing.draft}
                          onCommit={v => { setDraftCell(d.id, c, v === null ? { mode: 'null', value: '' } : { mode: 'value', value: v }); setDraftEditing(null); }}
                          onCancel={() => setDraftEditing(null)}
                          onDefault={col.auto || col.defaultValue !== null ? () => { setDraftCell(d.id, c, { mode: 'default', value: '' }); setDraftEditing(null); } : undefined} />
                      ) : (
                        <div className="max-w-[320px] truncate">
                          {cell.mode === 'default' ? <span className="italic">{defaultText(col)}</span>
                            : cell.mode === 'null' ? <Cell value={null} />
                              : cell.value === '' ? <span className="italic text-rose-300/70">{TEXT_TYPE.test(col.type) ? '(texto vacío)' : '(obligatoria)'}</span>
                                : cell.value}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
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
                        data-cell={`${r}:${c}`}
                        onClick={() => { if (!isEditing) selectCell(r, c); }}
                        onDoubleClick={() => startEdit(r, c)}
                        className={`px-3 h-8 text-white/80 whitespace-nowrap border-b border-line ${isDirty ? 'cell-dirty' : ''} ${active?.r === r && active.c === c && !isEditing ? 'cell-active' : ''} ${isEditing ? '' : 'cursor-pointer'}`}>
                        {isEditing ? (
                          <CellEditor initial={editing.draft} onCommit={commitEdit} onCancel={() => setEditing(null)} />
                        ) : (
                          /* El tope va en un div: en una celda de tabla max-width no se respeta.
                             `cell-clip`: si se corta, el globo muestra el valor entero (no en las ocultas). */
                          <div className={`max-w-[320px] truncate ${isHidden(c) ? '' : 'cell-clip'}`}>
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
      {deleting && deleting.length > 0 && (
        <DeleteRowsModal targets={deleting} pendingRows={pendingRows} onClose={() => setDeleting(null)}
          onConfirm={async target => {
            const res = await databasesApi.deleteRows(connectionId, sessionId, { ...target.ref, keys: target.keys });
            setDeleting(null);
            setSelected(new Set());
            notify.success(res.affectedRows === 1 ? 'Fila eliminada' : `${res.affectedRows} filas eliminadas`,
              res.affectedRows < target.keys.length ? `${target.keys.length - res.affectedRows} ya no existían.` : undefined);
            onRerun?.();
          }} />
      )}
      {tip && <CellTip tip={tip} onEnter={() => window.clearTimeout(tipTimer.current)} onLeave={() => hideTip()} />}
    </>
  );
};
