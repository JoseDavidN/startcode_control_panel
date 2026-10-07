import React, { useState } from 'react';
import { Modal } from '@components/common/Modal';

export type ProcessKillPhase = 'confirm' | 'sudo';

interface Props {
  name: string;
  pid: number;
  command?: string;
  phase: ProcessKillPhase;
  /** Texto del backend que explica por qué hace falta sudo. */
  hint?: string;
  error?: string | null;
  pending: boolean;
  onConfirm: (sudoPassword?: string) => void;
  onClose: () => void;
}

/**
 * Mismas dos fases que `ServiceActionModal`: confirmar el cierre y, si el
 * proceso es de otro usuario y sudo pide contraseña, pedirla.
 */
export const ProcessKillModal: React.FC<Props> = ({
  name,
  pid,
  command,
  phase,
  hint,
  error,
  pending,
  onConfirm,
  onClose,
}) => {
  const [sudoPassword, setSudoPassword] = useState('');

  const submit = () => {
    if (pending) return;
    onConfirm(phase === 'sudo' ? sudoPassword || undefined : undefined);
  };

  return (
    <Modal
      isOpen
      onClose={pending ? () => {} : onClose}
      title={`Cerrar ${name}`}
      size="sm"
    >
      <div className="space-y-4">
        {phase === 'confirm' ? (
          <div className="glass-soft rounded-xl p-4 flex items-start gap-3 border border-rose-400/25">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
              strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-rose-300 shrink-0 mt-0.5">
              <path d="M12 4L2 20h20L12 4z" /><path d="M12 10v5M12 18v.01" />
            </svg>
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                Se cerrará <span className="font-mono text-white/85">{name}</span>{' '}
                <span className="font-mono text-white/55">(PID {pid})</span>
              </div>
              {command && (
                <p className="text-[11px] font-mono text-white/45 mt-1 break-all line-clamp-2">{command}</p>
              )}
              <p className="text-xs text-white/60 mt-2 leading-relaxed">
                Se envía <span className="font-mono">SIGTERM</span> (sin <span className="font-mono">-9</span>):
                el proceso puede guardar y terminar limpio. Si lo gestiona un servicio, systemd
                podría volver a arrancarlo.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="glass-soft rounded-xl p-4">
              <div className="text-sm font-semibold text-white mb-1">Hace falta sudo</div>
              <p className="text-xs text-white/60 leading-relaxed">
                {hint ?? 'El proceso es de otro usuario y el usuario SSH no es root.'}
              </p>
            </div>

            <div>
              <div className="text-xs text-white/55 font-medium mb-1.5">Contraseña de sudo</div>
              <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
                <input
                  autoFocus
                  type="password"
                  autoComplete="off"
                  value={sudoPassword}
                  onChange={e => setSudoPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                  placeholder="Contraseña del usuario SSH"
                  className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25"
                />
              </div>
              <p className="text-[11px] text-white/40 mt-1.5">
                Se usa solo para esta acción y no se guarda.
              </p>
            </div>
          </>
        )}

        {error && (
          <div className="glass-soft rounded-xl p-3 text-rose-300 text-sm border border-rose-400/20">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={pending}
            className="mo-tab h-11 px-4 rounded-xl glass-soft text-white/85 row-hit
              text-sm font-medium disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={pending || (phase === 'sudo' && !sudoPassword)}
            className="mo-tab h-11 px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-40
              bg-rose-500/80 hover:bg-rose-500"
          >
            {pending ? 'Cerrando…' : 'Cerrar proceso'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
