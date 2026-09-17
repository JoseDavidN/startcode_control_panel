import React, { useState } from 'react';
import { Modal } from './Modal';
import { useDeleteServer } from '@hooks/useServers';
import { notify } from '@services/notification.service';
import type { Server } from '@services/server.service';
import type { AgentInstallError } from '@typings/agent.types';

interface Props {
  server: Server | null;
  onClose: () => void;
}

/** Estados del agente en los que hay algo que desinstalar antes de borrar. */
const NEEDS_UNINSTALL = ['installed', 'failed', 'installing'];

/**
 * Borrar un servidor desinstala su agente y arrastra métricas y notificaciones
 * por la cascada de la base de datos, así que va en dos pasos: primero se
 * confirma escribiendo el nombre —es irreversible y no debe salir de un clic
 * accidental en la tarjeta— y después se pide la contraseña de sudo, que es lo
 * que hace falta para entrar en la máquina y quitar el servicio.
 */
export const DeleteServerModal: React.FC<Props> = ({ server, onClose }) => {
  const remove = useDeleteServer();
  const [phase, setPhase] = useState<'confirm' | 'sudo'>('confirm');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<AgentInstallError | null>(null);
  const [force, setForce] = useState(false);
  const [sudoPassword, setSudoPassword] = useState('');

  if (!server) return null;

  const matches = confirmation.trim() === server.name;
  const agentState = server.metadata?.agent?.state;
  const hasAgent = Boolean(agentState && NEEDS_UNINSTALL.includes(agentState));

  const handleDelete = async () => {
    setError(null);

    try {
      const result = await remove.mutateAsync({
        id: server.id,
        force,
        sudoPassword: sudoPassword || undefined,
      });
      notify.success('Servidor eliminado', result.warning ?? server.name);
      onClose();
    } catch (err: unknown) {
      const response = (
        err as {
          response?: {
            status?: number;
            /* Nest envuelve el objeto del ConflictException en `message`. */
            data?: {
              agentError?: AgentInstallError;
              message?: { agentError?: AgentInstallError } | string;
            };
          };
        }
      ).response;

      /* 409: el agente no se pudo desinstalar y el servidor sigue ahí. Se
         ofrece forzar, pero a conciencia: hay que marcar la casilla. */
      if (response?.status === 409) {
        const body = response.data;
        const nested =
          body && typeof body.message === 'object' ? body.message.agentError : undefined;

        setAgentError(
          nested ??
            body?.agentError ?? {
              code: 'UNKNOWN',
              message: 'No se pudo desinstalar el agente',
            },
        );
        return;
      }

      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'No se pudo eliminar el servidor';
      setError(message);
    }
  };

  /* Sin agente que quitar no hay nada que preguntar: se borra directo. */
  const next = () => {
    if (!matches) return;
    if (hasAgent) setPhase('sudo');
    else void handleDelete();
  };

  return (
    <Modal
      isOpen
      onClose={remove.isPending ? () => {} : onClose}
      title="Eliminar servidor"
      size="sm"
    >
      <div className="space-y-4">
        {phase === 'confirm' ? (
          <>
            <div className="glass-soft rounded-xl p-4 flex items-start gap-3 border border-rose-400/25">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
                strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-rose-300 shrink-0 mt-0.5">
                <path d="M12 4L2 20h20L12 4z" /><path d="M12 10v5M12 18v.01" />
              </svg>
              <div>
                <div className="text-sm font-semibold">Esta acción no se puede deshacer</div>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                  {hasAgent
                    ? 'Se desinstalará el agente de la máquina y se eliminarán su historial de métricas y sus notificaciones.'
                    : 'Se eliminarán su historial de métricas y sus notificaciones.'}
                </p>
              </div>
            </div>

            <div>
              <div className="text-xs text-white/55 font-medium mb-1.5">
                Escribe <span className="font-mono text-white/80">{server.name}</span> para confirmar
              </div>
              <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
                <input
                  autoFocus
                  value={confirmation}
                  onChange={e => setConfirmation(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') next(); }}
                  placeholder={server.name}
                  className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="glass-soft rounded-xl p-4 border border-white/[0.06]">
              <div className="text-sm font-semibold text-white mb-1">
                Desinstalar el agente de {server.host}
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                El panel entrará por SSH como{' '}
                <span className="font-mono text-white/75">{server.username}</span> para parar el
                servicio y borrar el agente. Si ese usuario no es root, hace falta su contraseña
                de sudo.
              </p>
            </div>

            <div>
              <div className="text-xs text-white/55 font-medium mb-1.5">
                Contraseña de sudo <span className="text-white/35">(opcional)</span>
              </div>
              <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
                <input
                  autoFocus
                  type="password"
                  autoComplete="off"
                  value={sudoPassword}
                  onChange={e => setSudoPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleDelete(); }}
                  placeholder="Vacío si el usuario es root"
                  className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25"
                />
              </div>
              <p className="text-[11px] text-white/40 mt-1.5">
                Se usa solo para esta operación y no se guarda.
              </p>
            </div>
          </>
        )}

        {agentError && (
          <div className="glass-soft rounded-xl p-4 border border-rose-400/20 space-y-3">
            <div>
              <p className="text-sm font-semibold text-rose-300 mb-1">
                No se pudo desinstalar el agente
              </p>
              <p className="text-xs text-rose-200/80 leading-relaxed">{agentError.message}</p>
              {agentError.detail && (
                <details className="mt-2">
                  <summary className="text-xs text-white/50 cursor-pointer hover:text-white/75">Ver detalle</summary>
                  <pre className="mt-2 text-[11px] font-mono text-white/60 whitespace-pre-wrap max-h-32 overflow-y-auto scroll-thin">
                    {agentError.detail}
                  </pre>
                </details>
              )}
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="chk mt-0.5"
                checked={force}
                onChange={e => setForce(e.target.checked)}
              />
              <span className="text-xs text-white/70 leading-relaxed">
                Eliminar de todos modos. El agente seguirá instalado en la máquina y habrá
                que quitarlo a mano.
              </span>
            </label>
          </div>
        )}

        {error && (
          <div className="glass-soft rounded-xl p-3 text-rose-300 text-sm border border-rose-400/20">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={phase === 'sudo' && !remove.isPending ? () => setPhase('confirm') : onClose}
            disabled={remove.isPending}
            className="mo-tab h-11 px-4 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07]
              text-sm font-medium disabled:opacity-40"
          >
            {phase === 'sudo' ? 'Atrás' : 'Cancelar'}
          </button>
          <button
            onClick={phase === 'confirm' ? next : () => void handleDelete()}
            disabled={!matches || remove.isPending || (Boolean(agentError) && !force)}
            className="mo-tab h-11 px-5 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white
              text-sm font-semibold disabled:opacity-40"
          >
            {remove.isPending
              ? (hasAgent ? 'Desinstalando agente…' : 'Eliminando…')
              : force ? 'Eliminar de todos modos'
              : phase === 'confirm' && hasAgent ? 'Continuar'
              : 'Eliminar servidor'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
