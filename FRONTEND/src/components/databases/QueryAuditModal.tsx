import React from 'react';
import { Modal } from '@components/common/Modal';
import { DbIcon } from '@components/databases/icons';
import { useQueryAudit } from '@hooks/useDatabases';
import { fullDateTime, timeAgo } from '@utils/time';

interface QueryAuditModalProps {
  connectionId: string;
  isOpen: boolean;
  onClose: () => void;
}

const BADGE = 'text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1';

/** Consultas peligrosas confirmadas en el editor sobre esta conexión. */
export const QueryAuditModal: React.FC<QueryAuditModalProps> = ({ connectionId, isOpen, onClose }) => {
  const { data: entries = [], isLoading, isError } = useQueryAudit(connectionId, isOpen);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Auditoría de consultas peligrosas" size="lg">
      <p className="text-xs text-white/45 mb-4">
        Cada consulta que pidió confirmación y se ejecutó igualmente, con quién la lanzó, sobre qué base y cómo terminó.
        Se muestran las 50 más recientes.
      </p>

      {isLoading && <p className="text-sm text-white/45 py-6 text-center">Cargando…</p>}
      {isError && <p className="text-sm text-rose-300 py-6 text-center">No se pudo cargar la auditoría</p>}
      {!isLoading && !isError && entries.length === 0 && (
        <div className="edge-dashed rounded-xl py-10 flex flex-col items-center gap-2 text-center">
          <span className="text-white/20"><DbIcon name="shield" className="w-8 h-8" /></span>
          <p className="text-sm text-white/55">Todavía no se ha confirmado ninguna consulta peligrosa</p>
        </div>
      )}

      {entries.length > 0 && (
        <ul className="space-y-2.5">
          {entries.map(e => (
            <li key={e.id} className="glass-soft rounded-xl p-4">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {e.status === 'ok'
                  ? <span className={`${BADGE} bg-emerald-500/15 text-emerald-300 ring-emerald-400/20`}>Ejecutada</span>
                  : <span className={`${BADGE} bg-rose-500/15 text-rose-300 ring-rose-400/20`}>Error</span>}
                <span className="text-amber-300">{e.reason}</span>
                <span className="ml-auto text-white/40" title={fullDateTime(e.createdAt)}>{timeAgo(e.createdAt)}</span>
              </div>
              <pre className="mt-2.5 p-3 rounded-lg bg-tint-sunken border border-hairline-soft text-xs font-mono text-white/80 whitespace-pre-wrap break-all max-h-40 overflow-y-auto scroll-thin">{e.query}</pre>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-white/45 font-mono">
                {e.schema && <span>{e.schema}</span>}
                {e.schema && <span className="text-white/20">·</span>}
                <span>{e.durationMs} ms</span>
                {e.status === 'ok' && e.affectedRows !== null && (
                  <><span className="text-white/20">·</span><span>{e.affectedRows} {e.affectedRows === 1 ? 'fila' : 'filas'}</span></>
                )}
              </div>
              {e.error && <p className="mt-1.5 text-xs text-rose-300 break-words">{e.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
