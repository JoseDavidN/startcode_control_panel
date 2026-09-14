import React, { useState } from 'react';
import { Modal } from './Modal';
import { useDeleteServer } from '@hooks/useServers';
import { notify } from '@services/notification.service';
import type { Server } from '@services/server.service';

interface Props {
  server: Server | null;
  onClose: () => void;
}

/**
 * Borrar un servidor arrastra sus métricas y notificaciones por la cascada de
 * la base de datos, así que se pide escribir el nombre: es irreversible y no
 * debe poder hacerse de un clic accidental en la tarjeta.
 */
export const DeleteServerModal: React.FC<Props> = ({ server, onClose }) => {
  const remove = useDeleteServer();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!server) return null;

  const matches = confirmation.trim() === server.name;

  const handleDelete = async () => {
    if (!matches) return;
    setError(null);
    try {
      await remove.mutateAsync(server.id);
      notify.success('Servidor eliminado', server.name);
      onClose();
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'No se pudo eliminar el servidor';
      setError(message);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Eliminar servidor" size="sm">
      <div className="space-y-4">
        <div className="glass-soft rounded-xl p-4 flex items-start gap-3 border border-rose-400/25">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-rose-300 shrink-0 mt-0.5">
            <path d="M12 4L2 20h20L12 4z" /><path d="M12 10v5M12 18v.01" />
          </svg>
          <div>
            <div className="text-sm font-semibold">Esta acción no se puede deshacer</div>
            <p className="text-xs text-white/60 mt-1 leading-relaxed">
              Se eliminarán también su historial de métricas y sus notificaciones. El agente
              instalado en la máquina dejará de tener a dónde reportar.
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
              placeholder={server.name}
              className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25"
            />
          </div>
        </div>

        {error && (
          <div className="glass-soft rounded-xl p-3 text-rose-300 text-sm border border-rose-400/20">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="mo-tab h-11 px-4 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07] text-sm font-medium">
            Cancelar
          </button>
          <button
            onClick={() => void handleDelete()}
            disabled={!matches || remove.isPending}
            className="mo-tab h-11 px-5 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-sm font-semibold disabled:opacity-40"
          >
            {remove.isPending ? 'Eliminando…' : 'Eliminar servidor'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
