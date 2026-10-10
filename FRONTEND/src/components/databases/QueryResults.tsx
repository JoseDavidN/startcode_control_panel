import React, { memo, useMemo } from 'react';
import { DbIcon } from '@components/databases/icons';
import { ResultGrid } from '@components/databases/ResultGrid';
import type { QueryResult } from '@typings/database.types';

interface QueryResultsProps {
  result: QueryResult | undefined;
  error: string | null;
  running: boolean;
  /** Conexión sobre la que se guardan las celdas editadas. */
  connectionId: string;
  sessionId: string | null;
  /** Nombre base del archivo exportado, sin extensión. */
  fileName: string;
}

/* Cada resultado nuevo recibe un número: es la `key` de la tabla, y así una
   consulta nueva la remonta sin selección, columnas reveladas ni cambios. */
let resultSeq = 0;

/** Resultado de la última consulta. Con filas, la tabla (`ResultGrid`); si no, el estado. */
/* `memo`: la vista se re-renderiza con cada tecla del editor y esta tabla
   puede tener mil filas; solo cambia cuando cambia el resultado. */
export const QueryResults = memo(function QueryResults({ result, error, running, connectionId, sessionId, fileName }: QueryResultsProps) {
  const resultKey = useMemo(() => (result ? ++resultSeq : 0), [result]);

  /* ── Barra de estado ── */
  let status: React.ReactNode = <span className="text-white/40">Ejecuta una consulta para ver los resultados</span>;
  if (running) status = <span className="text-white/55">Ejecutando…</span>;
  else if (error) status = <span className="flex items-center gap-1.5 text-rose-300"><DbIcon name="alert" /> Error</span>;
  else if (result?.columns) {
    status = (
      <span className="flex items-center gap-2 text-white/60 shrink-0">
        <span className="text-emerald-300"><DbIcon name="check" /></span>
        <span className="tabular-nums">{result.rowCount.toLocaleString()} {result.rowCount === 1 ? 'fila' : 'filas'}</span>
        {result.truncated && <span className="text-amber-300">· se muestran las primeras {result.rows.length.toLocaleString()}</span>}
      </span>
    );
  } else if (result) {
    status = (
      <span className="flex items-center gap-2 text-white/60">
        <span className="text-emerald-300"><DbIcon name="check" /></span>
        <span className="tabular-nums">
          {result.affectedRows ?? 0} {result.affectedRows === 1 ? 'fila afectada' : 'filas afectadas'}
          {result.insertId ? ` · id insertado ${result.insertId}` : ''}
        </span>
      </span>
    );
  }

  if (result?.columns && result.columns.length > 0 && result.rows.length > 0 && !running && !error && sessionId) {
    return <ResultGrid key={resultKey} result={result} connectionId={connectionId} sessionId={sessionId} fileName={fileName} status={status} />;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-5 h-11 border-b border-line text-xs shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="font-semibold uppercase tracking-wider text-white/40">Resultados</h3>
          {status}
        </div>
        {result && !running && !error && (
          <span className="font-mono tabular-nums text-white/40 shrink-0">{result.durationMs} ms</span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto scroll-area scroll-layer">
        {error && !running && (
          <pre className="m-4 p-4 rounded-xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-300 font-mono whitespace-pre-wrap">{error}</pre>
        )}
        {!error && !running && result?.columns && (
          <div className="h-full flex items-center justify-center text-sm text-white/40">La consulta no devolvió filas</div>
        )}
      </div>
    </>
  );
});
