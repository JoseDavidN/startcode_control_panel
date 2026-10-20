import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from '@components/common/Modal';
import { onHostKeyMismatch } from '@lib/hostKeyAlert';
import { useAcceptHostKey } from '@hooks/useServers';
import { notify } from '@services/notification.service';
import type { ApiError } from '@typings/api.types';
import { HOST_KEY_CHECK_COMMAND, type HostKeyMismatch } from '@typings/hostKey.types';
import { HostKeyBlock as KeyBlock } from '@components/servers/HostKeyBlock';

type Phase = 'warn' | 'confirm';

interface AlertState {
  mismatch: HostKeyMismatch;
  phase: Phase;
  error: string | null;
}

/**
 * Aviso de clave de host SSH cambiada (posible MITM) o aún sin confirmar
 * (primera conexión a un servidor dado de alta sin escanear su huella). Se
 * monta una vez en AppLayout y lo abre cualquier conexión rechazada por el
 * backend: HTTP, terminal o SFTP (`reportHostKeyMismatch`).
 */
export const HostKeyMismatchModal: React.FC = () => {
  const [alert, setAlert] = useState<AlertState | null>(null);
  const accept = useAcceptHostKey();

  useEffect(() => onHostKeyMismatch(next => {
    /* Varias peticiones del mismo servidor fallan a la vez: un solo aviso. */
    setAlert(current =>
      current?.mismatch.serverId === next.serverId &&
      current.mismatch.received.fingerprint === next.received.fingerprint
        ? current
        : { mismatch: next, phase: 'warn', error: null });
  }), []);

  const close = useCallback(() => {
    if (!accept.isPending) setAlert(null);
  }, [accept.isPending]);

  if (!alert) return null;
  const { mismatch, phase, error } = alert;
  const setPhase = (next: Phase) => setAlert(a => (a ? { ...a, phase: next, error: null } : a));

  const target = `${mismatch.host}:${mismatch.port}`;
  const first = mismatch.expected === null;

  const confirm = () => {
    accept.mutate(
      { id: mismatch.serverId, fingerprint: mismatch.received.fingerprint },
      {
        onSuccess: () => {
          notify.success(
            first ? 'Huella confirmada' : 'Nueva huella aceptada',
            `${target} ${first ? 'ya está disponible' : 'vuelve a estar disponible'}. Repite la acción.`,
          );
          setAlert(null);
        },
        onError: (err: unknown) => {
          const message = (err as ApiError)?.message ?? 'No se pudo aceptar la huella';
          setAlert(a => (a ? { ...a, phase: 'warn', error: message } : a));
        },
      },
    );
  };

  return (
    <Modal isOpen onClose={close} title={first ? 'Confirma la clave de host SSH' : 'La clave de host SSH cambió'} size="md">
      <div className="space-y-4">
        {first ? (
        <div className="glass-soft rounded-xl p-4 flex items-start gap-3 border border-amber-400/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-amber-300 shrink-0 mt-0.5">
            <circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" />
          </svg>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Primera conexión a este servidor</div>
            <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
              El panel aún no tiene una huella confirmada para{' '}
              <span className="font-mono text-white/80">{target}</span>, así que no envió ninguna credencial.
              Compara la de abajo con la del propio servidor antes de confiar en ella:
            </p>
            <p className="text-xs text-white/60 mt-2 leading-relaxed">
              <span className="font-mono text-white/80 select-text">{HOST_KEY_CHECK_COMMAND}</span>{' '}
              (o el archivo del algoritmo que aparece abajo).
            </p>
          </div>
        </div>
        ) : (
        <div className="glass-soft rounded-xl p-4 flex items-start gap-3 border border-rose-400/25">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-rose-300 shrink-0 mt-0.5">
            <path d="M12 4L2 20h20L12 4z" /><path d="M12 10v5M12 18v.01" />
          </svg>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Posible ataque de intermediario (MITM)</div>
            <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
              <span className="font-mono text-white/80">{target}</span> presenta una clave de host distinta de la
              guardada, así que el panel cortó la conexión antes de autenticarse. Puede deberse a una
              reinstalación o a que se regeneraron las claves del servidor, pero también a que alguien
              intercepta la conexión.
            </p>
            <p className="text-xs text-white/60 mt-2 leading-relaxed">
              Compruébala en el propio servidor con{' '}
              <span className="font-mono text-white/80">{HOST_KEY_CHECK_COMMAND}</span>{' '}
              (o el archivo del algoritmo que aparece abajo) antes de aceptarla.
            </p>
          </div>
        </div>
        )}

        {mismatch.expected ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <KeyBlock label="Guardada" info={mismatch.expected} tone="muted" />
            <KeyBlock label="Recibida ahora" info={mismatch.received} tone="danger" />
          </div>
        ) : (
          <KeyBlock label="Presentada por el servidor" info={mismatch.received} tone="muted" />
        )}

        {phase === 'confirm' && (
          <div className="glass-soft rounded-xl p-4">
            <div className="text-sm font-semibold text-white mb-1">{first ? '¿Coincide con la del servidor?' : '¿Confías en la nueva clave?'}</div>
            <p className="text-xs text-white/60 leading-relaxed">
              El panel conectará a {target} solo si presenta{' '}
              <span className="font-mono text-white/80 break-all">{mismatch.received.fingerprint}</span>.
              Quedará registrado en tus notificaciones de seguridad.
            </p>
          </div>
        )}

        {error && (
          <div className="glass-soft rounded-xl p-3 text-rose-300 text-sm border border-rose-400/20">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={phase === 'confirm' ? () => setPhase('warn') : close}
            disabled={accept.isPending}
            className="mo-tab h-11 px-4 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium disabled:opacity-40"
          >
            {phase === 'confirm' ? 'Volver' : 'Cancelar'}
          </button>
          <button
            onClick={phase === 'confirm' ? confirm : () => setPhase('confirm')}
            disabled={accept.isPending}
            className={`mo-tab h-11 px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 ${
              first ? 'grad-brand' : 'bg-rose-500/80 hover:bg-rose-500'}`}
          >
            {accept.isPending
              ? 'Aceptando…'
              : first
                ? phase === 'confirm' ? 'Sí, coincide' : 'Confiar en esta huella'
                : phase === 'confirm' ? 'Sí, aceptar nueva huella' : 'Aceptar nueva huella'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
