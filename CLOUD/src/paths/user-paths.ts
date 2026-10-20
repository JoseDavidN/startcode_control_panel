import { join, sep } from 'path';
import type { SectionPaths } from '@/common/sections';

/* ── Carpetas de cada usuario ─────────────────────────────────────────
   Cada usuario tiene su propio Home y Backups y ninguno puede apuntar a la
   carpeta de otro (ni dentro ni por encima). Los que no eligieron rutas
   reciben `<primera carpeta permitida>/users/<usuario>/{home,backups}`;
   esa carpeta `users` queda reservada para esto. */

export const inside = (child: string, parent: string) =>
  child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

/** Una carpeta contiene a la otra (o son la misma). */
export const overlaps = (a: string, b: string) => inside(a, b) || inside(b, a);

/** Carpeta reservada para las rutas por defecto de cada usuario. */
export const usersBase = (root: string) => join(root, 'users');

export function personalPaths(root: string, username: string): SectionPaths {
  const dir = join(usersBase(root), username.toLowerCase());
  return { home: join(dir, 'home'), backups: join(dir, 'backups') };
}

interface UserLike {
  username: string;
  paths?: SectionPaths;
  createdAt: string;
}

/**
 * Rutas para los usuarios que aún no tienen. Antes todos compartían las
 * rutas por defecto (`CLOUD_DEFAULT_HOME`/`_BACKUPS`): si nadie tiene rutas
 * propias (instalación nueva o de antes de separar usuarios), el usuario más
 * antiguo se queda con ellas y con lo que ya hubiera; el resto, y cualquiera
 * que se cree después, recibe su carpeta personal. Nunca se asigna una ruta
 * que se solape con la de otro.
 */
export function assignMissingPaths(users: UserLike[], legacy: SectionPaths, root: string): Map<string, SectionPaths> {
  const result = new Map<string, SectionPaths>();
  const taken = users.flatMap(u => (u.paths ? [u.paths.home, u.paths.backups] : []));
  const free = (paths: SectionPaths) =>
    [paths.home, paths.backups].every(p => !taken.some(t => overlaps(p, t)));
  const legacyUsable = taken.length === 0
    && ![legacy.home, legacy.backups].some(p => overlaps(p, usersBase(root)));
  const missing = users.filter(u => !u.paths).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  missing.forEach((user, index) => {
    const paths = index === 0 && legacyUsable ? legacy : personalPaths(root, user.username);
    if (!free(paths)) return;
    result.set(user.username, paths);
    taken.push(paths.home, paths.backups);
  });
  return result;
}
