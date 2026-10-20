import React, { useRef, useState } from 'react';
import { Modal } from '@components/common/Modal';
import { Select } from '@components/common/Select';
import { TAG_FIELD_OPTIONS } from '@utils/tags';
import { normalizeKey, validateKey } from '@utils/servers';
import { EngineBadge } from '@components/databases/EngineIcon';
import { DatabasePicker } from '@components/databases/DatabasePicker';
import { HostKeyBlock } from '@components/servers/HostKeyBlock';
import { databasesApi } from '@services/databases.api';
import { serverService } from '@services/server.service';
import { useServers } from '@hooks/useServers';
import {
  useCreateDatabaseConnection,
  useDeleteDatabaseConnection,
  useTestDatabaseConnection,
  useUpdateDatabaseConnection,
} from '@hooks/useDatabases';
import {
  DATABASE_DEFAULT_PORTS,
  DATABASE_ENGINES,
  DATABASE_ENGINE_LABELS,
} from '@typings/database.types';
import type {
  DatabaseConnection,
  DatabaseConnectionForm,
  DatabaseEngine,
  DatabaseSshAuth,
  DatabaseSshMode,
} from '@typings/database.types';
import { HOST_KEY_CHECK_COMMAND, type HostKeyInfo } from '@typings/hostKey.types';

interface ConnectionModalProps {
  /** Con conexión edita; sin ella crea una nueva. */
  connection?: DatabaseConnection | null;
  /** Solo al crear: datos propuestos (por ejemplo, por el asistente). Las contraseñas las escribe el usuario. */
  initial?: Partial<Omit<DatabaseConnectionForm, 'password' | 'sshSecret'>>;
  onClose: () => void;
}

type Tab = 'connection' | 'database' | 'ssh';
type TunnelKind = Exclude<DatabaseSshMode, 'none'>;

/** Con túnel, el motor se alcanza desde el servidor SSH: el host deja de editarse. */
const TUNNEL_HOST = '127.0.0.1';

const EMPTY_FORM: DatabaseConnectionForm = {
  engine: 'mysql', name: '', host: '', port: DATABASE_DEFAULT_PORTS.mysql,
  username: '', password: '', database: '', tag: null,
  sshMode: 'none', sshServerId: '', sshHost: '', sshPort: 22, sshUsername: '', sshAuth: 'password',
  sshSecret: '', sshHostKeyFingerprint: '', sshHostKeyAlgorithm: '',
};

const toForm = (c: DatabaseConnection): DatabaseConnectionForm => ({
  engine: c.engine, name: c.name, host: c.host, port: c.port,
  username: c.username, password: '', database: c.database ?? '', tag: c.tag,
  sshMode: c.sshMode ?? 'none',
  sshServerId: c.sshServerId ?? '',
  sshHost: c.sshHost ?? '',
  sshPort: c.sshPort ?? 22,
  sshUsername: c.sshUsername ?? '',
  sshAuth: c.sshAuth ?? 'password',
  sshSecret: '',
  sshHostKeyFingerprint: c.sshHostKeyFingerprint ?? '',
  sshHostKeyAlgorithm: c.sshHostKeyAlgorithm ?? '',
});

/* Lo que cambia de un motor a otro en el formulario. */
const ENGINE_HINTS: Record<DatabaseEngine, { user: string; database: string }> = {
  mysql:      { user: 'root',     database: 'db_startcode' },
  mariadb:    { user: 'root',     database: 'db_startcode' },
  postgresql: { user: 'postgres', database: 'db_startcode' },
  redis:      { user: 'default',  database: '0' },
};

/** Mensaje del backend (los de validación llegan como lista). */
function errorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  return msg || (err as Error)?.message || fallback;
}

/* ── Campos (mismo patrón que AddServerModal) ─────────────────────── */
const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs text-white/55 font-medium mb-1.5">{children}</div>
);
const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">{children}</p>
);

const inputCls = 'w-full bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90 disabled:text-white/45';
const wrapCls  = 'glass-input rounded-xl h-11 flex items-center px-3.5 transition';

const svg = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
const EyeIcon = ({ open }: { open: boolean }) => open
  ? <svg {...svg} className="w-4 h-4"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
  : <svg {...svg} className="w-4 h-4"><path d="M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-2.5 3.4M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2M3 3l18 18" /></svg>;
const Spinner = () => <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />;

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  connection: <svg {...svg} className="w-4 h-4"><path d="M9 7H6a5 5 0 000 10h3M15 7h3a5 5 0 010 10h-3M8 12h8" /></svg>,
  database: <svg {...svg} className="w-4 h-4"><ellipse cx="12" cy="5.5" rx="7" ry="2.5" /><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></svg>,
  ssh: <svg {...svg} className="w-4 h-4"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M7 9l3 3-3 3M12 15h5" /></svg>,
};
const TABS: [Tab, string][] = [['connection', 'Conexión'], ['database', 'Base de datos'], ['ssh', 'Túnel SSH']];

/* ── Selector de motor ────────────────────────────────────────────── */
const EngineButton = ({ engine, active, onSelect }: {
  engine: DatabaseEngine; active: boolean; onSelect: () => void;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={active}
    onClick={onSelect}
    className={`mo-tab rounded-xl p-3 flex flex-col items-center gap-2 border
      ${active
        ? 'mo-tab-on grad-brand-soft border-hairline-strong elev-brand-sm text-white'
        : 'glass-soft row-hit text-white/60 hover:text-white'}`}
  >
    <EngineBadge engine={engine} size="sm" />
    <span className="text-sm font-medium">{DATABASE_ENGINE_LABELS[engine]}</span>
  </button>
);

/** Elección entre dos o tres opciones excluyentes, con el aspecto de las pestañas. */
function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 p-1 rounded-xl bg-tint-sunken">
      {options.map(([id, text]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}
          className={`mo-tab flex-1 h-9 px-3 rounded-lg text-sm font-medium border border-transparent
            ${value === id ? 'nav-active text-white' : 'text-white/60 hover:text-white hover:bg-tint-hover'}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={`toggle-track w-12 h-7 rounded-full relative shrink-0 border
      ${on ? 'grad-brand border-transparent elev-brand-sm' : 'bg-track border-hairline'}`}>
    <span className={`toggle-dot absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-[var(--knob)] shadow-md ${on ? 'translate-x-5' : ''}`} />
  </button>
);

/* Se monta solo mientras está abierto: al cerrarlo se desmonta y la
   contraseña revelada no se queda en memoria del componente. */
export const ConnectionModal: React.FC<ConnectionModalProps> = ({ connection, initial, onClose }) => {
  const editing = Boolean(connection);
  const [form, setForm] = useState<DatabaseConnectionForm>(() => {
    if (connection) return toForm(connection);
    const engine = initial?.engine ?? EMPTY_FORM.engine;
    return { ...EMPTY_FORM, port: DATABASE_DEFAULT_PORTS[engine], ...initial, engine };
  });
  const [tab, setTab] = useState<Tab>('connection');
  const [showPassword, setShowPassword] = useState(false);
  /* En edición la contraseña no se carga hasta pulsar el ojo. Mientras no se
     cargue ni se escriba, se omite al guardar y el backend conserva la suya. */
  const [passwordLoaded, setPasswordLoaded] = useState(!editing);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Base concreta o todas: por defecto todas (la conexión ve el servidor completo). */
  const [singleDatabase, setSingleDatabase] = useState(() => Boolean(connection?.database ?? initial?.database));

  /* Túnel. El secreto SSH guardado no vuelve nunca: solo se manda si se escribe. */
  const [tunnelKind, setTunnelKind] = useState<TunnelKind>(
    connection?.sshMode === 'custom' ? 'custom' : 'server',
  );
  const [sshSecretDirty, setSshSecretDirty] = useState(false);
  /* Host que tenía el campo antes de activar el túnel, para devolverlo al quitarlo. */
  const hostBeforeTunnel = useRef(connection && connection.sshMode !== 'none' ? '' : form.host);
  const [scan, setScan] = useState<{ target: string; key: HostKeyInfo } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const { data: servers = [] } = useServers();
  const createMutation = useCreateDatabaseConnection();
  const updateMutation = useUpdateDatabaseConnection();
  const deleteMutation = useDeleteDatabaseConnection();
  const testMutation = useTestDatabaseConnection();
  const saving = createMutation.isPending || updateMutation.isPending;

  const isRedis = form.engine === 'redis';
  const hints = ENGINE_HINTS[form.engine];
  const sendPassword = passwordLoaded || passwordDirty;
  const tunnelOn = form.sshMode !== 'none';
  const sshTarget = `${form.sshHost?.trim() ?? ''}:${form.sshPort ?? ''}`;
  /* El secreto guardado sirve mientras no se cambie el tipo (una contraseña no es una llave). */
  const storedSecretUsable = Boolean(connection?.hasSshSecret && connection.sshMode === 'custom' && connection.sshAuth === form.sshAuth);
  const keyState = form.sshAuth === 'key' && form.sshSecret ? validateKey(form.sshSecret) : null;
  const selectedServer = servers.find(s => s.id === form.sshServerId);

  const resetProbe = () => testMutation.reset();

  const selectEngine = (engine: DatabaseEngine) => {
    resetProbe();
    setForm(prev => ({
      ...prev,
      engine,
      /* El puerto solo sigue al motor mientras nadie lo haya cambiado a mano. */
      port: prev.port === DATABASE_DEFAULT_PORTS[prev.engine] ? DATABASE_DEFAULT_PORTS[engine] : prev.port,
      /* El índice de Redis no vale como nombre de base SQL, ni al revés. */
      database: (engine === 'redis') === (prev.engine === 'redis') ? prev.database : '',
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    resetProbe();
    if (name === 'password') setPasswordDirty(true);
    if (name === 'sshSecret') setSshSecretDirty(true);
    setForm(prev => {
      const next = {
        ...prev,
        [name]: name === 'port' || name === 'sshPort'
          ? parseInt(value) || 0
          : name === 'sshSecret' && prev.sshAuth === 'key' ? normalizeKey(value) : value,
      };
      /* Otro host o puerto SSH: la huella confirmada era de otro servidor. */
      if (name === 'sshHost' || name === 'sshPort') {
        next.sshHostKeyFingerprint = '';
        next.sshHostKeyAlgorithm = '';
      }
      return next;
    });
  };

  const setTunnel = (on: boolean) => {
    resetProbe();
    /* Sin servidores dados de alta solo cabe usar credenciales propias. */
    const kind: TunnelKind = servers.length ? tunnelKind : 'custom';
    if (on) setTunnelKind(kind);
    setForm(prev => {
      if (on === (prev.sshMode !== 'none')) return prev;
      if (on) {
        hostBeforeTunnel.current = prev.host;
        return { ...prev, sshMode: kind, host: TUNNEL_HOST };
      }
      return { ...prev, sshMode: 'none', host: hostBeforeTunnel.current };
    });
  };

  const selectTunnelKind = (kind: TunnelKind) => {
    resetProbe();
    setTunnelKind(kind);
    setForm(prev => ({ ...prev, sshMode: kind }));
  };

  const selectSshAuth = (auth: DatabaseSshAuth) => {
    resetProbe();
    setSshSecretDirty(false);
    setForm(prev => ({ ...prev, sshAuth: auth, sshSecret: '' }));
  };

  /* La huella se lee sin autenticarse y el usuario la compara antes de enviar credenciales. */
  const readHostKey = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const key = await serverService.scanHostKey(form.sshHost?.trim() ?? '', form.sshPort ?? 22);
      setScan({ target: sshTarget, key });
    } catch (err) {
      setScanError(errorMessage(err, 'No se pudo leer la clave del servidor SSH. Verifica el host y el puerto.'));
    } finally {
      setScanning(false);
    }
  };

  const confirmHostKey = () => {
    if (!scan) return;
    resetProbe();
    setForm(prev => ({
      ...prev,
      sshHostKeyFingerprint: scan.key.fingerprint,
      sshHostKeyAlgorithm: scan.key.algorithm ?? '',
    }));
    setScan(null);
  };

  /* El ojo es el único sitio donde la app recibe la contraseña en claro. */
  const togglePassword = async () => {
    if (showPassword || passwordLoaded || passwordDirty || !connection?.hasPassword) {
      setShowPassword(v => !v);
      return;
    }
    setRevealing(true);
    setError(null);
    try {
      const password = await databasesApi.revealPassword(connection.id);
      setForm(prev => ({ ...prev, password }));
      setPasswordLoaded(true);
      setShowPassword(true);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo obtener la contraseña'));
    } finally {
      setRevealing(false);
    }
  };

  /* Solo los campos del túnel elegido; el backend borra los del modo anterior. */
  const tunnelPayload = (): Partial<DatabaseConnectionForm> => {
    if (form.sshMode === 'server') return { sshMode: 'server', sshServerId: form.sshServerId };
    if (form.sshMode !== 'custom') return { sshMode: 'none' };
    return {
      sshMode: 'custom',
      sshHost: form.sshHost?.trim(),
      sshPort: form.sshPort,
      sshUsername: form.sshUsername?.trim(),
      sshAuth: form.sshAuth,
      sshSecret: sshSecretDirty && form.sshSecret ? form.sshSecret : undefined,
      sshHostKeyFingerprint: form.sshHostKeyFingerprint || undefined,
      sshHostKeyAlgorithm: form.sshHostKeyAlgorithm || undefined,
    };
  };

  const payload = (): DatabaseConnectionForm => ({
    engine: form.engine,
    name: form.name.trim(),
    host: form.host.trim(),
    port: form.port,
    username: form.username,
    tag: form.tag,
    database: singleDatabase || isRedis ? form.database.trim() : '',
    password: sendPassword ? form.password : undefined,
    ...tunnelPayload(),
  });

  /* Lo que viaja para probar o listar bases: sin `name` ni `tag` (el backend
     los rechaza) y, en edición, con `connectionId` para usar lo guardado. */
  const probePayload = () => {
    const rest: Partial<DatabaseConnectionForm> = payload();
    delete rest.name;
    delete rest.tag;
    return { ...(rest as Omit<DatabaseConnectionForm, 'name' | 'tag'>), connectionId: connection?.id };
  };

  /** Lo que falta en el túnel para poder conectar; null si está completo. */
  const tunnelProblem = (): string | null => {
    if (form.sshMode === 'server') {
      if (!form.sshServerId) return 'Elige el servidor por el que pasa el túnel SSH.';
      if (selectedServer && !selectedServer.hostKeyFingerprint) {
        return `${selectedServer.name} aún no tiene la huella SSH confirmada: confírmala desde su detalle.`;
      }
      return null;
    }
    if (form.sshMode !== 'custom') return null;
    if (!form.sshHost?.trim() || !form.sshPort || !form.sshUsername?.trim()) {
      return 'Completa el host, el puerto y el usuario del servidor SSH.';
    }
    if (!(sshSecretDirty && form.sshSecret) && !storedSecretUsable) {
      return form.sshAuth === 'key' ? 'Pega la llave privada SSH.' : 'Escribe la contraseña SSH.';
    }
    if (keyState && !keyState.valid) return keyState.error ?? 'La llave privada no es válida.';
    if (!form.sshHostKeyFingerprint) return 'Lee y confirma la huella del servidor SSH.';
    return null;
  };

  const connectionProblem = (): string | null => {
    if (!form.host.trim() || !form.port) return 'Completa el host y el puerto en la pestaña Conexión.';
    if (!isRedis && !form.username.trim()) return 'Completa el usuario en la pestaña Conexión.';
    return null;
  };

  /* El selector vuelve a pedir la lista cuando cambian estos datos. */
  const credentialsKey = JSON.stringify([
    form.engine, form.host.trim(), form.port, form.username.trim(),
    sendPassword ? form.password : '(guardada)', connection?.id ?? '', tunnelPayload(),
  ]);
  const pickerBlocked = connectionProblem() ?? (tunnelProblem() ? `Túnel SSH: ${tunnelProblem()}` : null);

  const handleTest = () => {
    setError(null);
    const problem = connectionProblem() ?? tunnelProblem();
    if (problem) { setError(problem); return; }
    testMutation.mutate(probePayload());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    /* Las pestañas ocultas no están en el DOM: su validación se hace aquí. */
    if (!form.name.trim() || connectionProblem()) {
      setTab('connection');
      setError(connectionProblem() ?? 'Escribe el nombre de la conexión.');
      return;
    }
    const tunnel = tunnelProblem();
    if (tunnel) { setTab('ssh'); setError(tunnel); return; }
    if (singleDatabase && !isRedis && !form.database.trim()) {
      setTab('database');
      setError('Elige la base de datos de la lista.');
      return;
    }
    try {
      if (connection) await updateMutation.mutateAsync({ id: connection.id, form: payload() });
      else await createMutation.mutateAsync(payload());
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la conexión'));
    }
  };

  const handleDelete = async () => {
    if (!connection) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await deleteMutation.mutateAsync(connection.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo eliminar la conexión'));
    }
  };

  const test = testMutation.data;

  /* ── Pestañas ────────────────────────────────────────────────────── */

  const connectionPane = (
    <div className="space-y-5">
      {/* Motor */}
      <div>
        <Label>Motor *</Label>
        <div role="radiogroup" aria-label="Motor de base de datos" className="grid grid-cols-4 gap-3">
          {DATABASE_ENGINES.map(engine => (
            <EngineButton
              key={engine}
              engine={engine}
              active={form.engine === engine}
              onSelect={() => selectEngine(engine)}
            />
          ))}
        </div>
      </div>

      {/* Nombre + etiqueta (opcional, una de la lista) en la misma fila (85/15). */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,85fr)_minmax(8.5rem,15fr)] gap-4">
        <div>
          <Label>Nombre de la conexión *</Label>
          <div className={wrapCls}>
            <input name="name" type="text" value={form.name} onChange={handleChange}
              required maxLength={100} placeholder="Ej: StartCode producción" className={inputCls} />
          </div>
        </div>
        <div title="Opcional: clasifica la conexión para encontrarla luego con los filtros">
          <Label>Etiqueta</Label>
          <div className={wrapCls}>
            <Select className="flex-1 min-w-0 text-white/90" value={form.tag ?? ''} options={TAG_FIELD_OPTIONS}
              onChange={tag => setForm(prev => ({ ...prev, tag: tag || null }))} aria-label="Etiqueta" />
          </div>
        </div>
      </div>

      {/* Host + Puerto */}
      <div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Label>Host / IP *</Label>
            <div className={wrapCls}>
              <input name="host" type="text" value={form.host} onChange={handleChange}
                required disabled={tunnelOn}
                placeholder="192.168.1.10 o db.example.com" className={`${inputCls} font-mono`} />
            </div>
          </div>
          <div>
            <Label>Puerto *</Label>
            <div className={wrapCls}>
              <input name="port" type="number" value={form.port || ''} onChange={handleChange}
                required min="1" max="65535" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          </div>
        </div>
        {tunnelOn && (
          <Hint>
            Conectas por túnel SSH: el motor se alcanza desde el servidor SSH en {TUNNEL_HOST}. El puerto es el del
            motor en ese servidor.
          </Hint>
        )}
      </div>

      {/* Credenciales */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Usuario {isRedis ? '(opcional)' : '*'}</Label>
          <div className={wrapCls}>
            <input name="username" type="text" value={form.username} onChange={handleChange}
              required={!isRedis} autoComplete="off" placeholder={hints.user} className={inputCls} />
          </div>
        </div>
        <div>
          <Label>Contraseña</Label>
          <div className={`${wrapCls} gap-2 pr-1.5`}>
            <input name="password" type={showPassword ? 'text' : 'password'} value={form.password ?? ''}
              onChange={handleChange} autoComplete="new-password"
              placeholder={editing && !sendPassword
                ? (connection?.hasPassword ? '•••••••• guardada' : 'Sin contraseña')
                : '••••••••'}
              className={`${inputCls} ${showPassword ? 'font-mono' : ''}`} />
            <button
              type="button"
              onClick={() => void togglePassword()}
              disabled={revealing}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              className="w-8 h-8 rounded-lg text-white/45 hover:text-white hover:bg-tint-hover flex items-center justify-center shrink-0 transition"
            >
              {revealing ? <Spinner /> : <EyeIcon open={!showPassword} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const databasePane = isRedis ? (
    <div>
      <Label>Índice de la base (opcional)</Label>
      <div className={wrapCls}>
        <input name="database" type="number" min="0" max="15" value={form.database} onChange={handleChange}
          placeholder={hints.database} className={`${inputCls} font-mono tabular-nums`} />
      </div>
      <Hint>Redis numera sus bases de 0 a 15. Vacío usa la 0.</Hint>
    </div>
  ) : (
    <div className="space-y-5">
      <div>
        <Label>Bases a las que entra la conexión</Label>
        <Segmented
          label="Bases de datos"
          value={singleDatabase ? 'single' : 'all'}
          options={[['all', 'Todas las bases de datos'], ['single', 'Una base concreta']]}
          onChange={v => { resetProbe(); setSingleDatabase(v === 'single'); }}
        />
        <Hint>
          {singleDatabase
            ? 'La conexión entra directamente a la base elegida.'
            : 'La conexión entra al servidor completo y el explorador muestra todas sus bases.'}
        </Hint>
      </div>
      {singleDatabase && (
        <div className="mo-panel">
          <DatabasePicker
            value={form.database}
            onChange={database => { resetProbe(); setForm(prev => ({ ...prev, database })); }}
            load={() => databasesApi.previewDatabases(probePayload())}
            credentialsKey={credentialsKey}
            blockedReason={pickerBlocked}
          />
          <Hint>
            Lista las bases del servidor con los datos de la pestaña Conexión{tunnelOn ? ' y el túnel SSH' : ''}.
          </Hint>
        </div>
      )}
    </div>
  );

  const hostKeyConfirmed = Boolean(form.sshHostKeyFingerprint);
  const customTunnel = (
    <div className="space-y-5 mo-panel">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Label>Host SSH *</Label>
          <div className={wrapCls}>
            <input name="sshHost" type="text" value={form.sshHost ?? ''} onChange={handleChange}
              placeholder="bastion.example.com" className={`${inputCls} font-mono`} />
          </div>
        </div>
        <div>
          <Label>Puerto SSH *</Label>
          <div className={wrapCls}>
            <input name="sshPort" type="number" value={form.sshPort || ''} onChange={handleChange}
              min="1" max="65535" className={`${inputCls} font-mono tabular-nums`} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Usuario SSH *</Label>
          <div className={wrapCls}>
            <input name="sshUsername" type="text" value={form.sshUsername ?? ''} onChange={handleChange}
              autoComplete="off" placeholder="deploy" className={inputCls} />
          </div>
        </div>
        <div>
          <Label>Autenticación</Label>
          <Segmented
            label="Autenticación SSH"
            value={form.sshAuth ?? 'password'}
            options={[['password', 'Contraseña'], ['key', 'Llave privada']]}
            onChange={selectSshAuth}
          />
        </div>
      </div>

      {form.sshAuth === 'key' ? (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Llave privada SSH *</Label>
            {keyState && (
              keyState.valid
                ? <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">Llave válida</span>
                : <span className="text-xs px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20">Llave inválida</span>
            )}
          </div>
          <div className="glass-input rounded-xl transition">
            <textarea name="sshSecret" value={form.sshSecret ?? ''} onChange={handleChange} rows={5}
              placeholder={storedSecretUsable && !sshSecretDirty
                ? 'Guardada. Pega otra para reemplazarla.'
                : '-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----'}
              className="w-full bg-transparent outline-none text-xs font-mono placeholder:text-white/25 text-white/90 p-3.5 resize-none" />
          </div>
          <Hint>Sin frase de paso. Se guarda cifrada y no vuelve a mostrarse.</Hint>
        </div>
      ) : (
        <div>
          <Label>Contraseña SSH *</Label>
          <div className={wrapCls}>
            <input name="sshSecret" type="password" value={form.sshSecret ?? ''} onChange={handleChange}
              autoComplete="new-password"
              placeholder={storedSecretUsable && !sshSecretDirty ? '•••••••• guardada' : '••••••••'}
              className={inputCls} />
          </div>
        </div>
      )}

      {/* Huella: se lee sin autenticarse y se confirma antes de enviar credenciales. */}
      <div>
        <Label>Huella del servidor SSH *</Label>
        {hostKeyConfirmed && !scan ? (
          <div className="space-y-2">
            <HostKeyBlock label="Confirmada" info={{ algorithm: form.sshHostKeyAlgorithm || null, fingerprint: form.sshHostKeyFingerprint ?? '' }} tone="muted" />
            <button type="button" onClick={() => void readHostKey()} disabled={scanning}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl glass-soft text-white/75 hover:text-white row-hit text-sm font-medium transition disabled:opacity-40">
              {scanning && <Spinner />}
              Volver a leer
            </button>
          </div>
        ) : scan ? (
          <div className="space-y-3">
            <div className="glass-soft rounded-xl p-4 border border-amber-400/20 text-xs text-white/60 leading-relaxed">
              <span className="font-mono text-white/80">{scan.target}</span> presentó esta clave. Aún no se envió
              ninguna credencial: compárala en el servidor con{' '}
              <span className="font-mono text-white/80 select-text">{HOST_KEY_CHECK_COMMAND}</span>. Si no coincide, no
              continúes.
            </div>
            <HostKeyBlock label="Presentada por el servidor" info={scan.key} tone="muted" />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setScan(null)}
                className="inline-flex items-center h-9 px-3.5 rounded-xl glass-soft text-white/75 hover:text-white row-hit text-sm font-medium transition">
                Descartar
              </button>
              <button type="button" onClick={confirmHostKey}
                className="inline-flex items-center h-9 px-3.5 rounded-xl grad-brand text-white text-sm font-medium elev-brand hover:elev-brand-hi transition">
                Coincide: confirmar
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => void readHostKey()}
              disabled={scanning || !form.sshHost?.trim() || !form.sshPort}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/80 hover:text-white row-hit text-sm font-medium transition disabled:opacity-40">
              {scanning && <Spinner />}
              Leer huella del servidor
            </button>
            <Hint>El panel solo se autentica contra la huella que confirmes.</Hint>
          </div>
        )}
        {scanError && <p className="text-xs text-rose-300 mt-2">{scanError}</p>}
      </div>
    </div>
  );

  const serverOptions = servers.map(s => ({
    value: s.id,
    label: s.name,
    hint: s.hostKeyFingerprint ? s.host : `${s.host} · huella sin confirmar`,
  }));
  const serverTunnel = (
    <div className="space-y-2 mo-panel">
      <Label>Servidor SSH *</Label>
      <div className={wrapCls}>
        <Select className="flex-1 min-w-0 text-white/90" value={form.sshServerId ?? ''} options={serverOptions}
          placeholder={servers.length ? 'Elige un servidor' : 'No tienes servidores dados de alta'}
          disabled={!servers.length}
          onChange={id => { resetProbe(); setForm(prev => ({ ...prev, sshServerId: id })); }}
          aria-label="Servidor SSH del túnel" />
      </div>
      {selectedServer && !selectedServer.hostKeyFingerprint ? (
        <p className="text-xs text-amber-300 leading-relaxed">
          {selectedServer.name} aún no tiene la huella SSH confirmada. Confírmala desde su detalle antes de usarlo como túnel.
        </p>
      ) : (
        <Hint>Usa el usuario, la llave privada y la huella confirmada de ese servidor.</Hint>
      )}
    </div>
  );

  const sshPane = (
    <div className="space-y-5">
      <div className="glass-soft rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white/90">Conectar por túnel SSH</div>
          <p className="text-xs text-white/50 mt-1 leading-relaxed">
            Para motores que solo escuchan dentro del servidor o de su red privada. Al activarlo, el host de la
            pestaña Conexión pasa a ser {TUNNEL_HOST} (visto desde el servidor SSH).
          </p>
        </div>
        <Toggle on={tunnelOn} onChange={setTunnel} label="Conectar por túnel SSH" />
      </div>

      {tunnelOn && (
        <>
          <Segmented
            label="Origen del túnel"
            value={tunnelKind}
            options={[['server', 'Servidor existente'], ['custom', 'Credenciales SSH']]}
            onChange={selectTunnelKind}
          />
          {tunnelKind === 'server' ? serverTunnel : customTunnel}
        </>
      )}
    </div>
  );

  return (
    <Modal isOpen onClose={saving ? () => {} : onClose} title={editing ? 'Editar conexión' : 'Nueva conexión'} size="lg">
      <form onSubmit={e => void handleSubmit(e)} className="space-y-5">
        <div role="tablist" aria-label="Secciones de la conexión" className="flex gap-1 p-1 rounded-xl bg-tint-sunken">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`mo-tab flex-1 h-9 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-transparent
                ${tab === id ? 'nav-active text-white' : 'text-white/60 hover:text-white hover:bg-tint-hover'}`}>
              {TAB_ICONS[id]}
              {label}
              {id === 'ssh' && tunnelOn && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-label="activo" />}
            </button>
          ))}
        </div>

        {error && (
          <div className="glass-soft rounded-xl p-4 border border-rose-400/20 text-sm text-rose-300">{error}</div>
        )}

        {/* Alto mínimo común: el modal no salta al cambiar de pestaña. */}
        <div key={tab} className="mo-panel min-h-[25rem]">
          {tab === 'connection' && connectionPane}
          {tab === 'database' && databasePane}
          {tab === 'ssh' && sshPane}
        </div>

        {/* Resultado de la prueba */}
        {test && (
          test.ok ? (
            <div className="glass-soft rounded-xl px-4 py-3 border border-emerald-400/20 text-sm text-emerald-300">
              Conexión correcta{tunnelOn && ' por túnel SSH'}
              {test.version && <span className="font-mono"> · {DATABASE_ENGINE_LABELS[form.engine]} {test.version}</span>}
              <span className="font-mono text-emerald-300/70"> · {test.latencyMs} ms</span>
            </div>
          ) : (
            <div className="glass-soft rounded-xl px-4 py-3 border border-rose-400/20 text-sm text-rose-300">
              {test.error ?? 'No se pudo conectar'}
            </div>
          )
        )}

        {/* Acciones */}
        <div className="flex items-center gap-3 pt-4 border-t border-line">
          <button type="button" onClick={handleTest}
            disabled={testMutation.isPending || !form.host.trim() || !form.port}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/80 hover:text-white row-hit text-sm font-medium transition disabled:opacity-40">
            {testMutation.isPending && <Spinner />}
            Probar conexión
          </button>
          {editing && (
            <button type="button" onClick={() => void handleDelete()}
              onBlur={() => setConfirmDelete(false)}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-rose-300 hover:bg-rose-500/10 border border-rose-500/15 text-sm font-medium transition disabled:opacity-40">
              {confirmDelete ? 'Confirmar eliminación' : 'Eliminar'}
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose} disabled={saving}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl glass-soft text-white/75 hover:text-white row-hit text-sm font-medium transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl grad-brand text-white text-sm font-medium elev-brand hover:elev-brand-hi transition disabled:opacity-60">
            {saving && <Spinner />}
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar conexión'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
