import { STORAGE_KEYS } from '@utils/constants';

/* ── Consultas guardadas en el equipo ─────────────────────────────────
   Por conexión y con nombre: a diferencia de las pestañas del editor
   (`sqlEditors.ts`), que son el estado de la sesión, estas las guarda el
   usuario y siguen ahí aunque cierre el editor. */

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  /** Base activa al guardar; al cargar se vuelve a ella. */
  schema: string | null;
  /** Epoch en milisegundos */
  updatedAt: number;
}

export const MAX_SAVED_QUERIES = 500;
export const MAX_QUERY_NAME = 80;

const keyOf = (connectionId: string) => `${STORAGE_KEYS.SQL_QUERIES}${connectionId}`;

/* Lo leído viene de disco: se valida antes de usarlo. */
const isQuery = (q: unknown): q is SavedQuery => {
  if (!q || typeof q !== 'object') return false;
  const { id, name, sql, schema, updatedAt } = q as Record<string, unknown>;
  return typeof id === 'string' && typeof name === 'string' && typeof sql === 'string'
    && (schema === null || typeof schema === 'string') && typeof updatedAt === 'number';
};

export function loadQueries(connectionId: string): SavedQuery[] {
  try {
    const data = JSON.parse(localStorage.getItem(keyOf(connectionId)) ?? '[]') as unknown;
    return Array.isArray(data) ? data.filter(isQuery) : [];
  } catch {
    return [];
  }
}

/** False si no se pudo escribir (almacenamiento lleno): aquí sí hay que avisar, es trabajo del usuario. */
export function writeQueries(connectionId: string, queries: SavedQuery[]): boolean {
  try {
    if (queries.length === 0) localStorage.removeItem(keyOf(connectionId));
    else localStorage.setItem(keyOf(connectionId), JSON.stringify(queries));
    return true;
  } catch {
    return false;
  }
}

export function removeQueries(connectionId: string): void {
  try { localStorage.removeItem(keyOf(connectionId)); } catch { /* bloqueado */ }
}

/** Misma consulta para el usuario: sin distinguir mayúsculas ni espacios de los lados. */
export const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
