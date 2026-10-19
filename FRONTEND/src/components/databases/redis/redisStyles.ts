import type { ApiError } from '@typings/api.types';

/* Clases y utilidades comunes del explorador de Redis. */

/** Mensaje de un error de la API (`ApiError` plano de `api.service`). */
export const messageOf = (err: unknown): string =>
  (err as Partial<ApiError> | undefined)?.message || (err as Error | undefined)?.message || 'Error desconocido';

export const smallBtn = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg glass-soft row-hit text-white/70 hover:text-white text-xs font-medium shrink-0 disabled:opacity-40 disabled:pointer-events-none';
export const iconBtn = 'w-7 h-7 rounded-md flex items-center justify-center text-white/45 hover:text-white hover:bg-tint-hover transition-colors shrink-0 disabled:opacity-40';
