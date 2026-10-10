import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@components/common/Modal';
import { CloudIcon } from '@components/cloud/icons';
import type { CloudIconName } from '@components/cloud/icons';
import { useCloudConnection } from '@hooks/useCloudConnection';
import { CLOUD_KEYS, useCloudPathsConfig } from '@hooks/useCloudData';
import { cloudApi, cloudErrorMessage } from '@services/cloud.api';
import { CLOUD_SECTIONS, cloudPathErrors, normalizeCloudPath } from '@utils/cloud';
import type { CloudPaths, CloudPathsConfig } from '@typings/cloud.types';

export type CloudSettingsTab = 'connection' | 'paths';

const TABS: [CloudSettingsTab, string, CloudIconName][] = [
  ['connection', 'Conexión', 'cloud'],
  ['paths', 'Rutas', 'folder'],
];

const HINTS: Record<keyof CloudPaths, string> = {
  home: 'Carpeta raíz de tus archivos: documentos, proyectos, imágenes…',
  backups: 'Carpeta raíz de los respaldos de bases de datos, servidores y configuraciones.',
};

const field = 'glass-input rounded-xl h-11 flex items-center gap-2 px-3.5 transition';
const input = 'flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-white/30 text-white';

const Spinner = () => <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />;

/* ── Conexión: primera vez (URL + cuenta de la nube) o la conexión activa ── */
const ConnectionPane = ({ onClose, onLeave }: { onClose: () => void; onLeave?: () => void }) => {
  const cloud = useCloudConnection();
  const [url, setUrl] = useState(cloud.connection?.url ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !username.trim() || !password) {
      setError('Escribe la URL, el usuario y la contraseña de la nube.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cloud.connect(url, username, password);
      setPassword('');
    } catch (err) {
      setError(cloudErrorMessage(err, 'No se pudo conectar con la nube.'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    await cloud.disconnect();
    setBusy(false);
  };

  if (cloud.status === 'connected' && cloud.connection) {
    return (
      <div className="space-y-5">
        <div className="glass-soft rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-white">StartCode Cloud</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md ring-1 bg-emerald-500/15 text-emerald-300 ring-emerald-400/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Conectado
            </span>
          </div>
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-white/45">Servidor</dt>
            <dd className="font-mono text-white/85 truncate" title={cloud.connection.url}>{cloud.connection.url}</dd>
            <dt className="text-white/45">Usuario</dt>
            <dd className="text-white/85 truncate">{cloud.connection.username}</dd>
            <dt className="text-white/45">Versión</dt>
            <dd className="font-mono text-white/85">{cloud.version ?? '—'}</dd>
          </dl>
        </div>
        <p className="text-xs text-white/45">Desconectar cierra la sesión de este equipo en la nube. Los archivos siguen en el servidor.</p>
        <div className="flex items-center gap-2 pt-3 border-t border-line">
          <span className="flex-1" />
          <button type="button" onClick={onClose}
            className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">
            Cerrar
          </button>
          <button type="button" onClick={() => void disconnect()} disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-sm font-semibold transition disabled:opacity-50">
            {busy && <Spinner />}
            Desconectar
          </button>
        </div>
      </div>
    );
  }

  /* Conexión guardada pero la nube no responde: se puede reintentar u olvidar. */
  const unreachable = cloud.status === 'disconnected' && cloud.connection;

  return (
    <form onSubmit={e => void submit(e)} className="space-y-4">
      {cloud.status === 'connecting' && (
        <p className="flex items-center gap-2 text-sm text-white/60"><Spinner /> Comprobando la conexión con la nube…</p>
      )}
      {unreachable && (
        <div className="rounded-xl p-3.5 bg-amber-500/10 ring-1 ring-amber-400/20 space-y-2.5">
          <p className="text-sm text-amber-200">No hay respuesta de la nube en <span className="font-mono">{cloud.connection?.url}</span>.</p>
          {cloud.error && <p className="text-xs text-white/55">{cloud.error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void cloud.retry()}
              className="h-8 px-3 rounded-lg glass-soft row-hit text-white/80 hover:text-white text-xs font-medium">
              Reintentar
            </button>
            <button type="button" onClick={() => void cloud.disconnect()}
              className="h-8 px-3 rounded-lg text-white/60 hover:text-white hover:bg-tint-hover text-xs font-medium">
              Olvidar conexión
            </button>
          </div>
        </div>
      )}
      {!unreachable && cloud.status === 'disconnected' && cloud.error && (
        <p className="text-xs text-amber-200">{cloud.error}</p>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">Conectar con la nube</h3>
        <p className="text-xs text-white/45">La primera vez, indica dónde está tu StartCode Cloud y con qué cuenta entrar. La sesión queda guardada en este equipo.</p>
      </div>

      <div>
        <label htmlFor="cloud-url" className="block text-xs font-medium text-white/55 mb-1.5">URL del servidor</label>
        <div className={field}>
          <span className="text-white/40"><CloudIcon name="cloud" className="w-4 h-4" /></span>
          <input id="cloud-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://servidor:3100"
            spellCheck={false} autoComplete="url" className={`${input} font-mono`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cloud-user" className="block text-xs font-medium text-white/55 mb-1.5">Usuario</label>
          <div className={field}>
            <span className="text-white/40"><CloudIcon name="user" className="w-4 h-4" /></span>
            <input id="cloud-user" value={username} onChange={e => setUsername(e.target.value)} placeholder="usuario"
              spellCheck={false} autoComplete="username" className={input} />
          </div>
        </div>
        <div>
          <label htmlFor="cloud-pass" className="block text-xs font-medium text-white/55 mb-1.5">Contraseña</label>
          <div className={field}>
            <input id="cloud-pass" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" spellCheck={false} className={input} />
            <button type="button" onClick={() => setShowPassword(v => !v)} aria-pressed={showPassword}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="w-7 h-7 -mr-1.5 rounded-lg text-white/40 hover:text-white hover:bg-tint-hover flex items-center justify-center shrink-0 transition-colors">
              <CloudIcon name={showPassword ? 'eyeOff' : 'eye'} className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}

      <div className="flex items-center gap-2 pt-3 border-t border-line">
        <span className="flex-1" />
        {/* Obligatorio: no se cierra sin conexión, pero se puede salir de Cloud. */}
        <button type="button" onClick={onLeave ?? onClose}
          className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">
          {onLeave ? 'Volver al panel' : 'Cancelar'}
        </button>
        <button type="submit" disabled={busy}
          className="inline-flex items-center gap-2 grad-brand text-sm font-semibold px-4 h-10 rounded-xl elev-brand hover:elev-brand-hi transition disabled:opacity-50">
          {busy && <Spinner />}
          Conectar
        </button>
      </div>
    </form>
  );
};

/* ── Rutas de Home y Backups, guardadas en la nube ── */
const PathsForm = ({ config, onSaved, onClose }: {
  config: CloudPathsConfig;
  onSaved: (paths: CloudPaths) => void;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const { connection } = useCloudConnection();
  const [draft, setDraft] = useState<CloudPaths>(config.paths);
  /* Los errores se muestran tras el primer intento de guardar. */
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors = cloudPathErrors(draft);
  const invalid = Object.keys(errors).length > 0;
  const unchanged = CLOUD_SECTIONS.every(({ id }) => normalizeCloudPath(draft[id]) === config.paths[id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (invalid) return;
    setSaving(true);
    setServerError(null);
    try {
      const saved = await cloudApi.savePaths({ home: normalizeCloudPath(draft.home), backups: normalizeCloudPath(draft.backups) });
      queryClient.setQueryData(CLOUD_KEYS.paths(connection), saved);
      /* Otras carpetas: los árboles y el almacenamiento cambian. */
      await queryClient.invalidateQueries({ queryKey: CLOUD_KEYS.all(connection) });
      onSaved(saved.paths);
    } catch (err) {
      setServerError(cloudErrorMessage(err, 'No se pudieron guardar las rutas.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={e => void submit(e)} className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">Rutas de las carpetas</h3>
        <p className="text-xs text-white/45">
          Dónde guarda la nube el contenido de cada sección. Deben estar dentro de{' '}
          <span className="font-mono text-white/65">{config.allowedRoots.join(' o ')}</span>; si no existen, se crean.
        </p>
      </div>

      {CLOUD_SECTIONS.map(({ id, label, icon }) => {
        const error = tried ? errors[id] : undefined;
        const inputId = `cloud-path-${id}`;
        return (
          <div key={id}>
            <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1.5">
              <CloudIcon name={icon} className="w-4 h-4 text-violet-300" />
              {label}
            </label>
            <div className={`${field} ${error ? 'ring-1 ring-rose-400/40' : ''}`}>
              <span className="text-white/40"><CloudIcon name="folder" className="w-4 h-4" /></span>
              <input id={inputId} value={draft[id]} spellCheck={false} autoComplete="off"
                onChange={e => setDraft(d => ({ ...d, [id]: e.target.value }))}
                placeholder={`${config.allowedRoots[0] ?? ''}/${id}`}
                aria-invalid={Boolean(error)} aria-describedby={`${inputId}-hint`}
                className={`${input} font-mono`} />
            </div>
            <p id={`${inputId}-hint`} className={`text-xs mt-1.5 ${error ? 'text-rose-300' : 'text-white/40'}`}>
              {error ?? HINTS[id]}
            </p>
          </div>
        );
      })}

      {serverError && <p role="alert" className="text-xs text-rose-300">{serverError}</p>}

      <div className="flex items-center gap-2 pt-3 border-t border-line">
        {/* Vuelve a lo guardado en la nube. */}
        <button type="button" onClick={() => { setDraft(config.paths); setTried(false); setServerError(null); }} disabled={unchanged}
          className="h-10 px-3 rounded-xl text-sm text-white/60 hover:text-white hover:bg-tint-hover transition disabled:opacity-40 disabled:pointer-events-none">
          Restablecer
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onClose}
          className="h-10 px-4 rounded-xl glass-soft row-hit text-white/80 hover:text-white text-sm font-medium">
          Cancelar
        </button>
        <button type="submit" disabled={(tried && invalid) || saving || unchanged}
          className="inline-flex items-center gap-2 grad-brand text-sm font-semibold px-4 h-10 rounded-xl elev-brand hover:elev-brand-hi transition disabled:opacity-50">
          {saving && <Spinner />}
          Guardar
        </button>
      </div>
    </form>
  );
};

const PathsPane = ({ onSaved, onClose }: { onSaved: (paths: CloudPaths) => void; onClose: () => void }) => {
  const { status, connection } = useCloudConnection();
  const connected = status === 'connected';
  const query = useCloudPathsConfig(connection, connected);

  if (!connected) {
    return <p className="py-10 text-center text-sm text-white/50">Conecta la nube en la pestaña Conexión para configurar las rutas.</p>;
  }
  if (query.isError) {
    return <p role="alert" className="py-10 text-center text-sm text-rose-300">{cloudErrorMessage(query.error, 'No se pudieron leer las rutas.')}</p>;
  }
  if (!query.data) {
    return <p className="py-10 flex items-center justify-center gap-2 text-sm text-white/50"><Spinner /> Leyendo las rutas de la nube…</p>;
  }
  /* key: si cambian las rutas guardadas, el formulario parte de ellas. */
  return <PathsForm key={JSON.stringify(query.data.paths)} config={query.data} onSaved={onSaved} onClose={onClose} />;
};

/* ── Configuración de Cloud ──────────────────────────────────────────
   Pestañas Conexión (con qué nube y cuenta trabaja el panel) y Rutas
   (dónde guarda esa nube Home y Backups). Se monta solo mientras está
   abierto: cada apertura parte de lo guardado.

   `required`: sin conexión es lo primero que se ve en Cloud y no se puede
   cerrar hasta conectar; solo queda la pestaña Conexión y, para no dejar
   al usuario encerrado, «Volver al panel» (`onLeave`). */
export const CloudSettingsModal = ({
  initialTab = 'connection', onPathsSaved, onClose, required = false, onLeave,
}: {
  initialTab?: CloudSettingsTab;
  onPathsSaved: (paths: CloudPaths) => void;
  onClose: () => void;
  required?: boolean;
  onLeave?: () => void;
}) => {
  const [chosen, setTab] = useState<CloudSettingsTab>(initialTab);
  const tab = required ? 'connection' : chosen;

  return (
    <Modal isOpen onClose={onClose} title={required ? 'Conectar con StartCode Cloud' : 'Configuración de Cloud'} size="md" dismissable={!required}>
      {!required && <div role="tablist" aria-label="Secciones de la configuración" className="flex gap-1 p-1 mb-5 rounded-xl bg-tint-sunken">
        {TABS.map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`mo-tab flex-1 h-9 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-transparent
              ${tab === id ? 'nav-active text-white' : 'text-white/60 hover:text-white hover:bg-tint-hover'}`}>
            <CloudIcon name={icon} className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>}
      <div key={tab} className="mo-panel">
        {tab === 'connection' && <ConnectionPane onClose={onClose} onLeave={required ? onLeave : undefined} />}
        {tab === 'paths' && <PathsPane onSaved={onPathsSaved} onClose={onClose} />}
      </div>
    </Modal>
  );
};
