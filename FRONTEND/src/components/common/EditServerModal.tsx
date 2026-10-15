import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Select } from '@components/common/Select';
import { SERVER_OS_OPTIONS, normalizeKey, validateKey } from '@utils/servers';
import { TAG_FIELD_OPTIONS, type ResourceTag } from '@utils/tags';
import { useUpdateServer, useUpdateServerKey } from '@hooks/useServers';
import { notify } from '@services/notification.service';
import type { Server } from '@services/server.service';

interface Props {
  server: Server | null;
  onClose: () => void;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs text-white/55 font-medium mb-1.5">{children}</div>
);

const inputCls = 'w-full bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90';
const wrapCls  = 'glass-input rounded-xl h-11 flex items-center px-3.5 transition';

export const EditServerModal: React.FC<Props> = ({ server, onClose }) => {
  const update = useUpdateServer();
  const updateKey = useUpdateServerKey();
  /* La llave no se muestra nunca (el backend no la devuelve): solo se puede sustituir. */
  const [changingKey, setChangingKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [form, setForm] = useState({
    name: '', host: '', port: 22, username: '', os: 'ubuntu', tag: '' as ResourceTag | '', description: '',
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
      tag: server.tag ?? '',
      description: server.description ?? '',
    });
    setChangingKey(false);
    setNewKey('');
    setError(null);
  }, [server]);

  if (!server) return null;

  const keyState = changingKey && newKey ? validateKey(newKey) : null;

  const set = (k: keyof typeof form) => (v: string | number) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      setError('Nombre, host y usuario son obligatorios.');
      return;
    }
    if (changingKey) {
      const kv = validateKey(newKey);
      if (!kv.valid) { setError(kv.error ?? 'Clave privada inválida'); return; }
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
          tag: form.tag || null,
          description: form.description.trim(),
        },
      });
      if (changingKey) await updateKey.mutateAsync({ id: server.id, privateKey: newKey });
      notify.success('Servidor actualizado', changingKey ? `${form.name.trim()} · llave privada cambiada` : form.name.trim());
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
      <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
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
              <Select className="w-full text-white/90" value={form.os} options={SERVER_OS_OPTIONS}
                onChange={set('os')} aria-label="Sistema operativo" />
            </div>
          </div>
        </div>

        <div>
          <Label>Etiqueta</Label>
          <div className={wrapCls}>
            <Select className="w-full text-white/90" value={form.tag} options={TAG_FIELD_OPTIONS}
              onChange={set('tag')} aria-label="Etiqueta" />
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

        {/* Llave privada: oculta tras un enlace; solo se sustituye, nunca se muestra la actual. */}
        {changingKey ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-white/55 font-medium">Nueva llave privada *</div>
              <div className="flex items-center gap-2">
                {keyState && (keyState.valid
                  ? <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">Clave válida</span>
                  : <span className="text-xs px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20">Clave inválida</span>)}
                <button type="button" onClick={() => { setChangingKey(false); setNewKey(''); setError(null); }}
                  className="text-xs text-white/50 hover:text-white">
                  Cancelar
                </button>
              </div>
            </div>
            <div className={`glass-input rounded-xl transition relative ${keyState ? (keyState.valid ? 'border-emerald-500/40' : 'border-rose-500/40') : ''}`}>
              <textarea autoFocus value={newKey} onChange={e => setNewKey(normalizeKey(e.target.value))} rows={7}
                spellCheck={false} autoComplete="off"
                placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA...\n-----END OPENSSH PRIVATE KEY-----'}
                className="w-full bg-transparent outline-none text-xs font-mono placeholder:text-white/25 text-white/90 p-3.5 resize-none" />
            </div>
            <p className="text-[11px] text-white/40 mt-1.5">
              Sustituye a la actual al guardar. Se guarda cifrada y no se vuelve a mostrar.
            </p>
          </div>
        ) : (
          <button type="button" onClick={() => setChangingKey(true)}
            className="text-xs font-medium text-violet-300 hover:text-violet-200 transition-colors">
            Cambiar llave privada
          </button>
        )}

        {error && (
          <div className="glass-soft rounded-xl p-3 text-rose-300 text-sm border border-rose-400/20">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="mo-tab h-11 px-4 rounded-xl glass-soft text-white/85 row-hit text-sm font-medium">
            Cancelar
          </button>
          <button type="submit" disabled={update.isPending || updateKey.isPending}
            className="mo-tab h-11 px-5 rounded-xl grad-brand text-white text-sm font-semibold elev-brand disabled:opacity-50">
            {update.isPending || updateKey.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
