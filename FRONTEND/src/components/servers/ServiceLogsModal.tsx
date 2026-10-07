import React from 'react';
import { Modal } from '@components/common/Modal';
import { useServiceLogs } from '@hooks/useServiceAction';

interface Props {
  serverId: string;
  serviceName: string;
  onClose: () => void;
}

const sp = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const LoaderIcon = ({ className = 'w-4 h-4' }) => (
  <svg {...sp} className={`${className} animate-spin`}><path d="M12 3a9 9 0 109 9" /></svg>
);
const RefreshIcon = ({ className = 'w-4 h-4' }) => (
  <svg {...sp} className={className}><path d="M21 12a9 9 0 11-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
);

/**
 * Las últimas líneas del journal de la unidad.
 *
 * Es la mitad que faltaba del tab: saber que algo está en `failed` no sirve de
 * nada si para ver el motivo hay que salirse a la terminal.
 */
export const ServiceLogsModal: React.FC<Props> = ({ serverId, serviceName, onClose }) => {
  const { data, isFetching, isError, error, refetch } = useServiceLogs(serverId, serviceName);

  const message =
    isError && typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message)
      : null;

  return (
    <Modal isOpen onClose={onClose} title={`Journal de ${serviceName}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-white/45">
            Últimas 200 líneas de <span className="font-mono">journalctl -u {serviceName}</span>
          </p>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="mo-tab flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft row-hit
              text-white/75 hover:text-white text-xs font-medium disabled:opacity-40"
          >
            {isFetching ? <LoaderIcon /> : <RefreshIcon />}
            {isFetching ? 'Leyendo…' : 'Actualizar'}
          </button>
        </div>

        {message && (
          <div className="glass-soft rounded-xl p-3 text-sm text-rose-300 border border-rose-400/20">
            {message}
          </div>
        )}

        {isFetching && !data ? (
          <div className="edge-dashed rounded-xl py-12 text-center text-sm text-white/45">
            Leyendo el journal del servidor…
          </div>
        ) : data ? (
          <pre className="glass-soft rounded-xl p-4 text-[11px] leading-relaxed font-mono
            text-white/70 whitespace-pre-wrap max-h-[55vh] overflow-y-auto scroll-thin">
            {data.lines}
          </pre>
        ) : !message ? (
          <div className="edge-dashed rounded-xl py-12 text-center text-sm text-white/45">
            Sin salida para esta unidad.
          </div>
        ) : null}
      </div>
    </Modal>
  );
};
