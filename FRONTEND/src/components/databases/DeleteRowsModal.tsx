import { useState } from 'react';
import { Modal } from '@components/common/Modal';
import { Select } from '@components/common/Select';
import { DbIcon } from '@components/databases/icons';
import type { TableRef } from '@typings/database.types';

/** Una tabla de la que se pueden borrar las filas seleccionadas, con la clave primaria de cada una. */
export interface DeleteTarget {
  id: string;
  ref: TableRef;
  keys: Record<string, unknown>[];
}

const label = (t: TableRef) => [t.schema, t.namespace, t.table].filter(Boolean).join('.');
const keyText = (k: Record<string, unknown>) =>
  Object.entries(k).map(([c, v]) => `${c} = ${v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v as string | number | boolean)}`).join(', ');

/**
 * Confirmación antes de borrar filas desde los resultados: dice de qué tabla,
 * cuántas y con qué clave primaria. En un JOIN se elige la tabla.
 */
export const DeleteRowsModal = ({ targets, pendingRows, onConfirm, onClose }: {
  targets: DeleteTarget[];
  /** Filas con cambios sin guardar: se pierden al repetir la consulta. */
  pendingRows: number;
  onConfirm: (target: DeleteTarget) => Promise<void>;
  onClose: () => void;
}) => {
  const [targetId, setTargetId] = useState(targets[0].id);
  const target = targets.find(t => t.id === targetId) ?? targets[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = target.keys.length;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(target);
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'No se pudieron borrar las filas');
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title={n === 1 ? 'Eliminar fila' : `Eliminar ${n} filas`} size="sm">
      <div className="space-y-4">
        {targets.length > 1 && (
          <div className="glass-input rounded-xl h-10 flex items-center gap-2 px-3">
            <span className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Tabla</span>
            <Select value={targetId} onChange={setTargetId} aria-label="Tabla" className="text-white/90"
              options={targets.map(t => ({ value: t.id, label: label(t.ref) }))} />
          </div>
        )}
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20 flex items-center justify-center shrink-0">
            <DbIcon name="trash" className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-white">
              ¿Eliminar {n === 1 ? 'la fila' : <>las <span className="font-semibold">{n} filas</span></>} de <span className="font-mono font-semibold break-all">{label(target.ref)}</span>?
            </p>
            <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto scroll-thin">
              {target.keys.slice(0, 8).map((k, i) => (
                <li key={i} className="text-xs font-mono text-white/60 truncate">{keyText(k)}</li>
              ))}
              {n > 8 && <li className="text-xs text-white/40">y {n - 8} más</li>}
            </ul>
            <p className="text-xs text-white/55 mt-2">
              Se borran por su clave primaria, todas o ninguna. Esta acción no se puede deshacer y queda en la auditoría.
              {pendingRows > 0 && <span className="text-amber-300"> Los cambios sin guardar de otras filas se pierden al actualizar el resultado.</span>}
            </p>
          </div>
        </div>
        {error && <div className="glass-soft rounded-xl p-3 border border-rose-400/20 text-sm text-rose-300 break-words">{error}</div>}
        <div className="flex justify-end gap-2 pt-3 border-t border-line">
          <button type="button" onClick={onClose} disabled={busy}
            className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={() => void confirm()} disabled={busy}
            className="h-10 px-4 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-sm font-semibold transition disabled:opacity-50">
            {busy ? 'Eliminando…' : n === 1 ? 'Eliminar fila' : `Eliminar ${n} filas`}
          </button>
        </div>
      </div>
    </Modal>
  );
};
