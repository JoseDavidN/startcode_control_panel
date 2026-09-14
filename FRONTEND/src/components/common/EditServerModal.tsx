import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useUpdateServer } from '@hooks/useServers';
import { notify } from '@services/notification.service';
import type { Server } from '@services/server.service';

interface Props {
  server: Server | null;
  onClose: () => void;
}

const OS_OPTIONS = [
  { value: 'ubuntu',  label: 'Ubuntu' },
  { value: 'centos',  label: 'CentOS' },
  { value: 'debian',  label: 'Debian' },
  { value: 'fedora',  label: 'Fedora' },
  { value: 'arch',    label: 'Arch Linux' },
  { value: 'solaris', label: 'Solaris' },
  { value: 'openbsd', label: 'OpenBSD' },
  { value: 'netbsd',  label: 'NetBSD' },
  { value: 'freebsd', label: 'FreeBSD' },
  { value: 'other',   label: 'Otro' },
];

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs text-white/55 font-medium mb-1.5">{children}</div>
);

const inputCls = 'w-full bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90';
const wrapCls  = 'glass-input rounded-xl h-11 flex items-center px-3.5 transition';

export const EditServerModal: React.FC<Props> = ({ server, onClose }) => {
  const update = useUpdateServer();
  const [form, setForm] = useState({
    name: '', host: '', port: 22, username: '', os: 'ubuntu', description: '',
  });
  const [error, setError] = useState<string | null>(null);

  /* El formulario se rellena al abrir: el modal se monta ya con el servidor. */
  useEffect(() => {
    if (!server) return;
    setForm({
      name: server.name ?? '',
      host: server.host ?? '',
      port: server.port ?? 22,
      username: server.username ?? '',
      os: server.os ?? 'ubuntu',
      description: server.description ?? '',
    });
    setError(null);
  }, [server]);

  if (!server) return null;

  const set = (k: keyof typeof form) => (v: string | number) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      setError('Nombre, host y usuario son obligatorios.');
      return;
    }

    try {
      await update.mutateAsync({
        id: server.id,
        data: {
          name: form.name.trim(),
          host: form.host.trim(),
          port: Number(form.port) || 22,
          username: form.username.trim(),
          os: form.os,
          description: form.description.trim(),
        },
      });
      notify.success('Servidor actualizado', form.name.trim());
      onClose();
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'No se pudo actualizar el servidor';
      setError(message);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Editar ${server.name}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Nombre *</Label>
          <div className={wrapCls}>
            <input className={inputCls} value={form.name}
              onChange={e => set('name')(e.target.value)} placeholder="Servidor de producción" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label>Host o IP *</Label>
            <div className={wrapCls}>
              <input className={inputCls} value={form.host}
                onChange={e => set('host')(e.target.value)} placeholder="192.168.1.10" />
            </div>
          </div>
          <div>
            <Label>Puerto</Label>
            <div className={wrapCls}>
              <input className={inputCls} type="number" min={1} max={65535} value={form.port}
                onChange={e => set('port')(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Usuario SSH *</Label>
            <div className={wrapCls}>
              <input className={inputCls} value={form.username}
                onChange={e => set('username')(e.target.value)} placeholder="root" />
            </div>
          </div>
          <div>
            <Label>Sistema operativo</Label>
            <div className={wrapCls}>
              <select className={`${inputCls} cursor-pointer`} value={form.os}
                onChange={e => set('os')(e.target.value)}>
                {OS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div>
          <Label>Descripción</Label>
          <div className="glass-input rounded-xl px-3.5 py-2.5">
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.description}
              onChange={e => set('description')(e.target.value)}
              placeholder="Notas sobre este servidor" />
          </div>
        </div>

        <p className="text-xs text-white/35">
          La llave privada no se edita aquí: tiene su propio flujo para no exponerla.
        </p>

        {error && (
          <div className="glass-soft rounded-xl p-3 text-rose-300 text-sm border border-rose-400/20">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="mo-tab h-11 px-4 rounded-xl glass-soft text-white/85 hover:bg-white/[0.07] text-sm font-medium">
            Cancelar
          </button>
          <button type="submit" disabled={update.isPending}
            className="mo-tab h-11 px-5 rounded-xl grad-brand text-white text-sm font-semibold shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)] disabled:opacity-50">
            {update.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
