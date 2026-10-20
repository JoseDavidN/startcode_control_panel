import { fileTypeFromName } from '@/files/file-types';

/** Lado mayor de la miniatura, en píxeles (el mosaico la pinta a ~150 px, doble para pantallas HiDPI). */
export const THUMB_SIZE = 320;

/* Formatos que pueden tener transparencia: van a PNG para no quedar sobre negro. */
const ALPHA_EXTS = new Set(['png', 'gif', 'svg', 'webp', 'ico', 'avif']);

/* Lo que un webview pinta por sí mismo: sin ffmpeg se envía el original si no es enorme. */
const NATIVE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif']);
export const NATIVE_FALLBACK_MAX_BYTES = 8 * 1024 ** 2;

export type ThumbFormat = 'jpg' | 'png';

const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

/** Si el archivo admite miniatura (imagen o video). */
export const hasThumbnail = (name: string) => {
  const type = fileTypeFromName(name);
  return type === 'image' || type === 'video';
};

export const thumbFormat = (name: string): ThumbFormat =>
  fileTypeFromName(name) === 'image' && ALPHA_EXTS.has(extOf(name)) ? 'png' : 'jpg';

/** Sin ffmpeg: imagen que se puede enviar tal cual en lugar de la miniatura. */
export const nativeFallback = (name: string, size: number) =>
  fileTypeFromName(name) === 'image' && NATIVE_EXTS.has(extOf(name)) && size <= NATIVE_FALLBACK_MAX_BYTES;

/**
 * Argumentos de ffmpeg para un fotograma reducido a `THUMB_SIZE` sin
 * deformar. En videos, `seek` salta los primeros segundos (suelen ser negro
 * o un logo); con `-ss` antes de `-i` el salto es por fotograma clave y no
 * decodifica lo anterior.
 */
export function thumbnailArgs(input: string, output: string, format: ThumbFormat, seek: number): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    ...(seek > 0 ? ['-ss', String(seek)] : []),
    '-i', input,
    '-frames:v', '1',
    '-an', '-sn', '-dn',
    '-vf', `scale=w=${THUMB_SIZE}:h=${THUMB_SIZE}:force_original_aspect_ratio=decrease`,
    ...(format === 'png' ? ['-c:v', 'png'] : ['-c:v', 'mjpeg', '-q:v', '5']),
    '-f', 'image2', '-y', output,
  ];
}
