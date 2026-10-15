import { STORAGE_KEYS } from '@utils/constants';

/* ── Editores SQL guardados en el equipo ──────────────────────────────
   Por conexión: las pestañas (número, nombre y texto) y la activa. Sin
   resultados ni historial de deshacer. En localStorage porque se lee de forma
   síncrona al montar la vista, antes de pintar las pestañas. */

export interface SavedEditor { n: number; sql: string; name?: string }
export interface SavedEditors { editors: SavedEditor[]; active: number }

const keyOf = (connectionId: string) => `${STORAGE_KEYS.SQL_EDITORS}${connectionId}`;

/* Lo leído viene de disco: se valida antes de usarlo. */
const isEditor = (e: unknown): e is SavedEditor => {
  if (!e || typeof e !== 'object') return false;
  const { n, sql, name } = e as Record<string, unknown>;
  return Number.isInteger(n) && (n as number) > 0 && typeof sql === 'string'
    && (name === undefined || typeof name === 'string');
};

export function loadEditors(connectionId: string, max: number): SavedEditors | null {
  try {
    const raw = localStorage.getItem(keyOf(connectionId));
    if (!raw) return null;
    const data = JSON.parse(raw) as { editors?: unknown; active?: unknown };
    const editors = Array.isArray(data.editors) ? data.editors.filter(isEditor).slice(0, max) : [];
    if (!editors.length) return null;
    const active = typeof data.active === 'number' && data.active >= 0 && data.active < editors.length ? data.active : 0;
    return { editors, active };
  } catch {
    return null;
  }
}

export function saveEditors(connectionId: string, data: SavedEditors): void {
  try {
    /* Una sola pestaña vacía y sin nombre es el estado inicial: no hace falta guardarla. */
    const [first] = data.editors;
    if (data.editors.length === 1 && !first.sql && !first.name) localStorage.removeItem(keyOf(connectionId));
    else localStorage.setItem(keyOf(connectionId), JSON.stringify(data));
  } catch { /* almacenamiento lleno o bloqueado: se sigue sin guardar */ }
}

export function removeEditors(connectionId: string): void {
  try { localStorage.removeItem(keyOf(connectionId)); } catch { /* bloqueado */ }
}
