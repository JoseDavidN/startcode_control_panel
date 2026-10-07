import React, { useState } from 'react';
import { Modal } from '@components/common/Modal';
import type { ServiceAction } from '@services/service-control.service';

export type ServiceActionPhase = 'confirm' | 'sudo';

interface Props {
  serviceName: string;
  action: ServiceAction;
  phase: ServiceActionPhase;
  /** Texto del backend que explica por qué hace falta sudo. */
  hint?: string;
  error?: string | null;
  pending: boolean;
  onConfirm: (sudoPassword?: string) => void;
  onClose: () => void;
}

const ACTION_LABEL: Record<ServiceAction, string> = {
  start: 'Iniciar',
  stop: 'Parar',
  restart: 'Reiniciar',
  enable: 'Habilitar',
  disable: 'Deshabilitar',
};

const PENDING_LABEL: Record<ServiceAction, string> = {
  start: 'Iniciando…',
  stop: 'Parando…',
  restart: 'Reiniciando…',
  enable: 'Habilitando…',
  disable: 'Deshabilitando…',
};

/**
 * Dos fases, como en `DeleteServerModal`:
 *
 * - **confirm**: solo para `stop`. Parar una unidad no se deshace solo, y hay
 *   servicios que dejan la máquina incomunicada, así que no debe salir de un
 *   clic accidental en la tarjeta.
 * - **sudo**: la abre el backend cuando responde `SUDO_REQUIRED`, porque el
 *   usuario SSH no es root y sudo pide contraseña.
 */
export const ServiceActionModal: React.FC<Props> = ({
  serviceName,
  action,
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
      title={`${ACTION_LABEL[action]} ${serviceName}`}
      size="sm"
    >
      <div className="space-y-4">
        {phase === 'confirm' ? (
          <div className="glass-soft rounded-xl p-4 flex items-start gap-3 border border-rose-400/25">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
              strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-rose-300 shrink-0 mt-0.5">
              <path d="M12 4L2 20h20L12 4z" /><path d="M12 10v5M12 18v.01" />
            </svg>
            <div>
              <div className="text-sm font-semibold">
                Se detendrá <span className="font-mono text-white/85">{serviceName}</span>
              </div>
              <p className="text-xs text-white/60 mt-1 leading-relaxed">
                El servicio dejará de dar servicio hasta que vuelvas a iniciarlo. Parar unidades
                como <span className="font-mono">sshd</span>,{' '}
                <span className="font-mono">postgresql</span> o{' '}
                <span className="font-mono">startcode-agent</span> puede dejar el servidor
                incomunicado o al panel sin métricas.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="glass-soft rounded-xl p-4">
              <div className="text-sm font-semibold text-white mb-1">Hace falta sudo</div>
              <p className="text-xs text-white/60 leading-relaxed">
                {hint ?? 'systemctl necesita privilegios y el usuario SSH no es root.'}
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
            className={`mo-tab h-11 px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-40
              ${action === 'stop'
                ? 'bg-rose-500/80 hover:bg-rose-500'
                : 'grad-brand elev-brand-sm'}`}
          >
            {pending ? PENDING_LABEL[action] : ACTION_LABEL[action]}
          </button>
        </div>
      </div>
    </Modal>
  );
};
