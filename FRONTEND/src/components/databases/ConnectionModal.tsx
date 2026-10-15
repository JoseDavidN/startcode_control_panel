import React, { useState } from 'react';
import { Modal } from '@components/common/Modal';
import { Select } from '@components/common/Select';
import { TAG_FIELD_OPTIONS } from '@utils/tags';
import { EngineBadge } from '@components/databases/EngineIcon';
import { DatabasePicker } from '@components/databases/DatabasePicker';
import { databasesApi } from '@services/databases.api';
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
} from '@typings/database.types';

interface ConnectionModalProps {
  /** Con conexión edita; sin ella crea una nueva. */
  connection?: DatabaseConnection | null;
  /** Solo al crear: datos propuestos (por ejemplo, por el asistente). La contraseña la escribe el usuario. */
  initial?: Partial<Omit<DatabaseConnectionForm, 'password'>>;
  onClose: () => void;
}

const EMPTY_FORM: DatabaseConnectionForm = {
  engine: 'mysql', name: '', host: '', port: DATABASE_DEFAULT_PORTS.mysql,
  username: '', password: '', database: '', tag: null,
};

const toForm = (c: DatabaseConnection): DatabaseConnectionForm => ({
  engine: c.engine, name: c.name, host: c.host, port: c.port,
  username: c.username, password: '', database: c.database ?? '', tag: c.tag,
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

const inputCls = 'w-full bg-transparent outline-none text-sm placeholder:text-white/30 text-white/90';
const wrapCls  = 'glass-input rounded-xl h-11 flex items-center px-3.5 transition';

const svg = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
const EyeIcon = ({ open }: { open: boolean }) => open
  ? <svg {...svg} className="w-4 h-4"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
  : <svg {...svg} className="w-4 h-4"><path d="M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-2.5 3.4M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2M3 3l18 18" /></svg>;
const Spinner = () => <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />;

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

/* Se monta solo mientras está abierto: al cerrarlo se desmonta y la
   contraseña revelada no se queda en memoria del componente. */
export const ConnectionModal: React.FC<ConnectionModalProps> = ({ connection, initial, onClose }) => {
  const editing = Boolean(connection);
  const [form, setForm] = useState<DatabaseConnectionForm>(() => {
    if (connection) return toForm(connection);
    const engine = initial?.engine ?? EMPTY_FORM.engine;
    return { ...EMPTY_FORM, port: DATABASE_DEFAULT_PORTS[engine], ...initial, engine };
  });
  const [showPassword, setShowPassword] = useState(false);
  /* En edición la contraseña no se carga hasta pulsar el ojo. Mientras no se
     cargue ni se escriba, se omite al guardar y el backend conserva la suya. */
  const [passwordLoaded, setPasswordLoaded] = useState(!editing);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateDatabaseConnection();
  const updateMutation = useUpdateDatabaseConnection();
  const deleteMutation = useDeleteDatabaseConnection();
  const testMutation = useTestDatabaseConnection();
  const saving = createMutation.isPending || updateMutation.isPending;

  const isRedis = form.engine === 'redis';
  const hints = ENGINE_HINTS[form.engine];
  const sendPassword = passwordLoaded || passwordDirty;

  const selectEngine = (engine: DatabaseEngine) => {
    testMutation.reset();
    setForm(prev => ({
      ...prev,
      engine,
      /* El puerto solo sigue al motor mientras nadie lo haya cambiado a mano. */
      port: prev.port === DATABASE_DEFAULT_PORTS[prev.engine] ? DATABASE_DEFAULT_PORTS[engine] : prev.port,
      /* El índice de Redis no vale como nombre de base SQL, ni al revés. */
      database: (engine === 'redis') === (prev.engine === 'redis') ? prev.database : '',
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    testMutation.reset();
    if (name === 'password') setPasswordDirty(true);
    setForm(prev => ({ ...prev, [name]: name === 'port' ? parseInt(value) || 0 : value }));
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

  const payload = (): DatabaseConnectionForm => ({
    ...form,
    name: form.name.trim(),
    host: form.host.trim(),
    database: form.database.trim(),
    password: sendPassword ? form.password : undefined,
  });

  /* Lo que viaja para probar o listar bases: sin `name` (el backend lo rechaza)
     y, en edición, con `connectionId` para usar la contraseña guardada. */
  const probePayload = () => {
    const { engine, host, port, username, password, database } = payload();
    return { engine, host, port, username, password, database, connectionId: connection?.id };
  };

  /* El selector vuelve a pedir la lista cuando cambian estos datos. */
  const credentialsKey = [
    form.engine, form.host.trim(), form.port, form.username.trim(),
    sendPassword ? form.password : '(guardada)', connection?.id ?? '',
  ].join('\u0000');
  const pickerBlocked = !form.host.trim() || !form.port
    ? 'Completa el host y el puerto para ver las bases disponibles.'
    : !form.username.trim()
    ? 'Completa el usuario para ver las bases disponibles.'
    : null;

  const handleTest = () => {
    setError(null);
    testMutation.mutate(probePayload());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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

  return (
    <Modal isOpen onClose={saving ? () => {} : onClose} title={editing ? 'Editar conexión' : 'Nueva conexión'} size="lg">
      <form onSubmit={e => void handleSubmit(e)} className="space-y-5">
        {error && (
          <div className="glass-soft rounded-xl p-4 border border-rose-400/20 text-sm text-rose-300">{error}</div>
        )}

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
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Label>Host / IP *</Label>
            <div className={wrapCls}>
              <input name="host" type="text" value={form.host} onChange={handleChange}
                required placeholder="192.168.1.10 o db.example.com" className={`${inputCls} font-mono`} />
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

        {/* Base de datos */}
        <div>
          <Label>{isRedis ? 'Índice de la base (opcional)' : 'Base de datos (opcional)'}</Label>
          {isRedis ? (
            <div className={wrapCls}>
              <input name="database" type="number" min="0" max="15" value={form.database} onChange={handleChange}
                placeholder={hints.database} className={`${inputCls} font-mono tabular-nums`} />
            </div>
          ) : (
            <DatabasePicker
              value={form.database}
              onChange={database => { testMutation.reset(); setForm(prev => ({ ...prev, database })); }}
              placeholder={hints.database}
              load={() => databasesApi.previewDatabases(probePayload())}
              credentialsKey={credentialsKey}
              blockedReason={pickerBlocked}
            />
          )}
          <p className="text-[11px] text-white/40 mt-1.5">
            {isRedis
              ? 'Redis numera sus bases de 0 a 15. Vacío usa la 0.'
              : 'Pulsa el campo para elegir entre las bases del servidor, o escribe el nombre. Vacío conecta al servidor completo y muestra todas sus bases.'}
          </p>
        </div>

        {/* Resultado de la prueba */}
        {test && (
          test.ok ? (
            <div className="glass-soft rounded-xl px-4 py-3 border border-emerald-400/20 text-sm text-emerald-300">
              Conexión correcta
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
