import React, { useState } from 'react';
import { Modal } from './Modal';
import { useCreateServer } from '@hooks/useServers';
import { ConnectionLoading } from './ConectionLoading';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ServerFormData {
  name: string;
  host: string;
  port: number;
  username: string;
  privateKey: string;
  os: string;
  description: string;
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

/* ── Reusable field label ─────────────────────────────────────────── */
const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs text-white/55 font-medium mb-1.5">{children}</div>
);

/* ── Glass input ──────────────────────────────────────────────────── */
const inputCls = 'w-full bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90';
const wrapCls  = 'glass-input rounded-xl h-11 flex items-center px-3.5 transition';

export const AddServerModal: React.FC<AddServerModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<ServerFormData>({
    name: '', host: '', port: 22, username: 'root',
    privateKey: '', os: 'ubuntu', description: '',
  });
  const [error, setError]           = useState<string | null>(null);
  const [isConnecting, setConnecting] = useState(false);
  const createMutation              = useCreateServer();

  /* ── Private key validation ── */
  const validateKey = (key: string): { valid: boolean; error?: string } => {
    const k = key.trim();
    if (!k) return { valid: false, error: 'La clave privada es requerida' };
    if (!k.includes('BEGIN') || !k.includes('PRIVATE KEY'))
      return { valid: false, error: 'Debe contener "BEGIN ... PRIVATE KEY"' };
    if (!/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(k))
      return { valid: false, error: 'Debe comenzar con "-----BEGIN ... PRIVATE KEY-----"' };
    if (!/-----END [A-Z ]+PRIVATE KEY-----/.test(k))
      return { valid: false, error: 'Debe terminar con "-----END ... PRIVATE KEY-----"' };
    if ((k.includes('BEGIN RSA PRIVATE KEY') || k.includes('BEGIN EC PRIVATE KEY')) && k.includes('ENCRYPTED'))
      return { valid: false, error: 'La clave tiene passphrase. Remuévela con: ssh-keygen -p -N "" -f tu_clave' };
    const minLength = k.includes('BEGIN OPENSSH PRIVATE KEY') ? 400 : 800;
    if (k.length < minLength) return { valid: false, error: 'La clave parece estar incompleta' };
    return { valid: true };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'privateKey') {
      setFormData(prev => ({ ...prev, privateKey: value.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n') }));
    } else {
      setFormData(prev => ({ ...prev, [name]: name === 'port' ? parseInt(value) || 22 : value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const kv = validateKey(formData.privateKey);
    if (!kv.valid) { setError(kv.error || 'Clave privada inválida'); return; }

    try {
      await createMutation.mutateAsync(formData);
      setConnecting(true);
      await new Promise(r => setTimeout(r, 3000));
      setFormData({ name: '', host: '', port: 22, username: 'root', privateKey: '', os: 'ubuntu', description: '' });
      setConnecting(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Error al agregar el servidor';
      if (msg.includes('authentication methods failed') || msg.includes('clave SSH'))
        setError('Error de autenticación SSH. Verifica que la clave privada sea correcta.');
      else if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT'))
        setError('No se puede conectar al servidor. Verifica el host y puerto.');
      else setError(msg);
    }
  };

  const keyState = formData.privateKey ? validateKey(formData.privateKey) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agregar Nuevo Servidor" size="lg">
      <form onSubmit={handleSubmit} className="relative space-y-5">
        {/* Connecting overlay */}
        {isConnecting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center glass rounded-xl">
            <ConnectionLoading />
          </div>
        )}

        {/* Error */}
        {error && !isConnecting && (
          <div className="glass-soft rounded-xl p-4 border border-rose-400/20 flex items-start gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
              strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-rose-300 shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16v.01"/>
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-300 mb-1">Error al agregar servidor</p>
              <p className="text-xs text-rose-200/80 whitespace-pre-line leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Nombre */}
        <div>
          <Label>Nombre del Servidor *</Label>
          <div className={wrapCls}>
            <input name="name" type="text" value={formData.name} onChange={handleChange}
              required placeholder="Ej: Web Server 01" className={inputCls} />
          </div>
        </div>

        {/* Host + Puerto */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label>Host / IP *</Label>
            <div className={wrapCls}>
              <input name="host" type="text" value={formData.host} onChange={handleChange}
                required placeholder="192.168.1.10 o example.com" className={inputCls} />
            </div>
          </div>
          <div>
            <Label>Puerto SSH *</Label>
            <div className={wrapCls}>
              <input name="port" type="number" value={formData.port} onChange={handleChange}
                required min="1" max="65535" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Usuario + OS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Usuario SSH *</Label>
            <div className={wrapCls}>
              <input name="username" type="text" value={formData.username} onChange={handleChange}
                required placeholder="root" className={inputCls} />
            </div>
          </div>
          <div>
            <Label>Sistema Operativo *</Label>
            <div className={`${wrapCls}`}>
              <select name="os" value={formData.os} onChange={handleChange}
                required className="flex-1 bg-transparent outline-none text-sm text-white/90">
                {OS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Clave Privada */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Clave Privada SSH *</Label>
            {keyState && (
              keyState.valid
                ? <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">Clave válida</span>
                : <span className="text-xs px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20">Clave inválida</span>
            )}
          </div>
          <div className={`glass-input rounded-xl transition relative ${
            keyState
              ? keyState.valid
                ? 'border-emerald-500/40'
                : 'border-rose-500/40'
              : ''
          }`}>
            <textarea name="privateKey" value={formData.privateKey} onChange={handleChange}
              required rows={8}
              placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA...\n-----END OPENSSH PRIVATE KEY-----'}
              className="w-full bg-transparent outline-none text-xs font-mono placeholder:text-white/25 text-white/90 p-3.5 resize-none" />
            {formData.privateKey && (
              <div className="absolute bottom-2 right-3 text-[10px] text-white/30">
                {formData.privateKey.length} caracteres
              </div>
            )}
          </div>

          <div className="mt-3 space-y-2.5">
            {/* Info requisitos */}
            <div className="glass-soft rounded-xl p-3 border border-sky-400/15">
              <div className="flex items-center gap-2 mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
                  strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-sky-300 shrink-0">
                  <circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8v.01"/>
                </svg>
                <span className="text-xs font-semibold text-sky-300">Requisitos de la clave SSH</span>
              </div>
              <div className="space-y-1 pl-6">
                {[
                  'Formatos: OpenSSH o PEM',
                  'OpenSSH: -----BEGIN OPENSSH PRIVATE KEY-----',
                  'PEM: -----BEGIN RSA/EC PRIVATE KEY-----',
                  'Sin passphrase (formato PEM antiguo)',
                ].map((t, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    <span className="text-xs text-white/60">{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Generar clave */}
            <div className="glass-soft rounded-xl p-3 border border-emerald-400/15">
              <div className="flex items-center gap-2 mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
                  strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-300 shrink-0">
                  <circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>
                </svg>
                <span className="text-xs font-semibold text-emerald-300">Generar nueva clave ed25519 (recomendado)</span>
              </div>
              <div className="pl-6 space-y-2">
                <div className="relative group">
                  <code className="block text-[10px] bg-black/40 p-2 rounded-lg text-emerald-300 font-mono leading-relaxed">
                    ssh-keygen -t ed25519 -N "" -f ~/.ssh/startcode_key
                  </code>
                  <button type="button"
                    onClick={() => navigator.clipboard.writeText('ssh-keygen -t ed25519 -N "" -f ~/.ssh/startcode_key')}
                    className="absolute top-1.5 right-1.5 p-1 rounded glass-soft opacity-0 group-hover:opacity-100 transition">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
                      strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-white/60">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                  </button>
                </div>
                <p className="text-[10px] text-white/45">
                  Copia la clave pública al servidor: <code className="text-emerald-300/80">ssh-copy-id -i ~/.ssh/startcode_key.pub user@host</code>
                </p>
              </div>
            </div>

            {/* Advertencia authorized_keys */}
            <div className="glass-soft rounded-xl p-3 border border-amber-400/15 flex items-start gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
                strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-300 shrink-0 mt-0.5">
                <path d="M12 4L2 20h20L12 4z"/><path d="M12 10v5M12 18v.01"/>
              </svg>
              <p className="text-xs text-amber-200/80">
                La clave pública debe estar en <code className="text-amber-300">~/.ssh/authorized_keys</code> del servidor remoto.
              </p>
            </div>
          </div>
        </div>

        {/* Descripción */}
        <div>
          <Label>Descripción (Opcional)</Label>
          <div className="glass-input rounded-xl transition">
            <textarea name="description" value={formData.description} onChange={handleChange}
              rows={3} placeholder="Descripción o notas sobre este servidor…"
              className="w-full bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90 p-3.5 resize-none" />
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.06]">
          <button type="button" onClick={onClose}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/75 hover:text-white hover:bg-white/[0.07] text-sm font-medium transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit"
            disabled={createMutation.isPending || isConnecting}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white text-sm font-medium shadow-[0_8px_24px_-8px_rgba(168,85,247,0.55)] hover:shadow-[0_12px_30px_-8px_rgba(236,72,153,0.55)] transition disabled:opacity-50">
            {createMutation.isPending || isConnecting ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {isConnecting ? 'Conectando…' : 'Agregando…'}
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
                  strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <rect x="3" y="4" width="18" height="7" rx="1.5"/>
                  <rect x="3" y="13" width="18" height="7" rx="1.5"/>
                  <path d="M7 7.5h.01M7 16.5h.01"/>
                </svg>
                Agregar Servidor
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
