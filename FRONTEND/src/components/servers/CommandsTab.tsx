import React from 'react';
import { useCommandHistory } from '@hooks/useServerCommands';
import { STATUS_TONE, fmtMs, statusLabel } from '@utils/commands';
import { fullDateTime, timeAgo } from '@utils/time';

interface Props {
  serverId: string;
  /** Carga el comando en la barra flotante para volver a ejecutarlo. */
  onReuse: (command: string) => void;
}

/**
 * Registro de los comandos ejecutados en el servidor, de cualquier usuario.
 * Se ejecutan desde la barra flotante del detalle; aquí solo se consultan.
 */
export const CommandsTab: React.FC<Props> = ({ serverId, onReuse }) => {
  const { data: audit = [], isLoading } = useCommandHistory(serverId);

  return (
    <div className="mo-panel glass rounded-2xl grain p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">Comandos ejecutados</h2>
        <p className="text-xs text-white/45 mt-0.5">
          Últimos 50 comandos en este servidor, de cualquier usuario · pulsa uno para cargarlo en la línea de comandos
        </p>
      </div>

      {isLoading ? (
        <div className="edge-dashed rounded-xl py-8 text-center text-sm text-white/45">Cargando…</div>
      ) : audit.length === 0 ? (
        <div className="edge-dashed rounded-xl py-8 text-center text-sm text-white/45">
          Todavía no se ha ejecutado ningún comando desde el panel.
        </div>
      ) : (
        <div className="space-y-1.5">
          {audit.map(row => (
            <button
              key={row.id}
              onClick={() => onReuse(row.sudo ? `sudo ${row.command}` : row.command)}
              title="Cargar en la línea de comandos"
              className="w-full text-left glass-soft row-hit rounded-xl px-3 py-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 items-center"
            >
              <span className="text-xs font-mono text-white/85 truncate">
                {row.sudo && <span className="text-amber-300 mr-1.5">sudo</span>}
                {row.command}
              </span>
              <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 justify-self-end ${STATUS_TONE[row.status]}`}>
                {statusLabel(row.status, row.exitCode)}
              </span>
              <span className="text-[11px] text-white/45 truncate">
                {row.user.name || row.user.email} · <span className="font-mono">{row.cwd ?? '~'}</span>
              </span>
              <span className="text-[11px] text-white/40 justify-self-end" title={fullDateTime(row.createdAt)}>
                {timeAgo(row.createdAt)} · {fmtMs(row.durationMs)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
