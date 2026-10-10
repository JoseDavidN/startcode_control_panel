import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { lstat } from 'fs/promises';
import { join } from 'path';
import { cloudError } from '@/common/errors';

/* ── Seguridad de rutas ───────────────────────────────────────────────
   Toda ruta que llega del panel es relativa a la raíz de una sección y se
   reconstruye segmento a segmento: nada absoluto, nada de `.`/`..`, y
   ningún segmento existente puede ser un enlace simbólico (podría apuntar
   fuera de la raíz). Las reglas de nombre son las del panel (entryNameError). */

const FORBIDDEN = /[\\/:*?"<>|\0]/;

/** Por qué no vale un nombre de carpeta o archivo, o null si vale. */
export function nameError(name: string): string | null {
  const clean = name.trim();
  if (!clean) return 'El nombre está vacío.';
  if (clean !== name) return 'El nombre no puede empezar ni terminar con espacios.';
  if (clean.length > 120) return 'El nombre no puede pasar de 120 caracteres.';
  if (FORBIDDEN.test(clean)) return 'El nombre no puede llevar / \\ : * ? " < > |';
  if (clean === '.' || clean === '..') return 'Ese nombre no está permitido.';
  return null;
}

export function assertName(name: string): void {
  const error = nameError(name);
  if (error) throw cloudError(BadRequestException, 'INVALID_NAME', error);
}

/** Segmentos de una ruta relativa POSIX (`''` = la raíz). */
export function parseRelative(rel: string | undefined | null): string[] {
  if (rel === undefined || rel === null || rel === '' || rel === '/') return [];
  if (rel.startsWith('/') || rel.includes('\\')) {
    throw cloudError(BadRequestException, 'INVALID_PATH', 'La ruta debe ser relativa a la sección.');
  }
  const segments = rel.split('/');
  for (const segment of segments) {
    const error = nameError(segment);
    if (error) throw cloudError(BadRequestException, 'INVALID_PATH', `Ruta no válida: ${error}`);
  }
  return segments;
}

export const joinInside = (root: string, segments: string[]) => join(root, ...segments);

/**
 * Comprueba que ningún segmento existente bajo la raíz sea un enlace
 * simbólico. Los que aún no existen (se van a crear) se aceptan.
 */
export async function assertNoSymlinks(root: string, segments: string[]): Promise<void> {
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw cloudError(ForbiddenException, 'SYMLINK', 'La ruta atraviesa un enlace simbólico y no se puede usar desde la nube.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

/** Ruta relativa POSIX a partir de segmentos (los `id` del árbol). */
export const toRelative = (segments: string[]) => segments.join('/');
