import { SERVER_OS_OPTIONS } from '@utils/servers';
import { TAG_OPTIONS, type ResourceTag } from '@utils/tags';
import { DATABASE_DEFAULT_PORTS, DATABASE_ENGINES } from '@typings/database.types';
import type { DatabaseConnectionForm, DatabaseEngine } from '@typings/database.types';
import type { AddServerInitial } from '@components/common/AddServerModal';

/**
 * Altas que el asistente puede proponer. Llegan como un bloque
 * ```startcode-servidor``` o ```startcode-conexion``` con JSON; el panel lo
 * muestra como tarjeta y, al confirmar, abre el formulario de siempre ya
 * rellenado. La llave SSH y la contraseña las escribe el usuario ahí: nunca
 * pasan por el modelo. Nada se crea sin que el usuario lo guarde.
 */
export const ACTION_LANGS = { server: 'startcode-servidor', database: 'startcode-conexion' } as const;

export type AssistantAction =
  | { kind: 'server'; data: AddServerInitial }
  | { kind: 'database'; data: Partial<Omit<DatabaseConnectionForm, 'password'>> };

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

const port = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined;
};

const tag = (v: unknown): ResourceTag | undefined =>
  TAG_OPTIONS.some(t => t.value === v) ? (v as ResourceTag) : undefined;

/* Sin claves vacías: lo que no venga se queda con el valor por defecto del formulario. */
const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Lee el bloque del modelo. Solo pasan campos conocidos y valores válidos; si no hay JSON, null. */
export function parseAction(lang: string, code: string): AssistantAction | null {
  const l = lang.toLowerCase();
  if (l !== ACTION_LANGS.server && l !== ACTION_LANGS.database) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(code);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  if (l === ACTION_LANGS.server) {
    const os = SERVER_OS_OPTIONS.some(o => o.value === raw.os) ? (raw.os as string) : undefined;
    return {
      kind: 'server',
      data: compact({
        name: str(raw.name, 100), host: str(raw.host, 255), port: port(raw.port),
        username: str(raw.username, 100), os, tag: tag(raw.tag), description: str(raw.description, 255),
      }),
    };
  }

  const engine = DATABASE_ENGINES.includes(raw.engine as DatabaseEngine) ? (raw.engine as DatabaseEngine) : undefined;
  return {
    kind: 'database',
    data: compact({
      engine, name: str(raw.name, 100), host: str(raw.host, 255),
      port: port(raw.port) ?? (engine ? DATABASE_DEFAULT_PORTS[engine] : undefined),
      username: str(raw.username, 128),
      database: typeof raw.database === 'number' ? String(raw.database) : str(raw.database, 128),
      tag: tag(raw.tag),
    }),
  };
}
