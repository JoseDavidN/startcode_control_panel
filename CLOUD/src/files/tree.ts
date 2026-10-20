import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { fileTypeFromName } from './file-types';
import type { CloudEntryDto, CloudFolderDto } from './files.types';

const logger = new Logger('CloudTree');

/** Fecha de creación: birthtime donde el sistema la da, si no ctime. */
const created = (s: { birthtimeMs: number; ctime: Date; birthtime: Date }) =>
  (s.birthtimeMs > 0 ? s.birthtime : s.ctime).toISOString();

/**
 * Árbol completo de una sección leído del disco. Salta enlaces simbólicos,
 * sockets y demás especiales, y se detiene en `maxEntries` para que una
 * carpeta enorme no bloquee al servidor ni al panel.
 */
export async function buildTree(root: string, name: string, maxEntries: number): Promise<CloudFolderDto> {
  return (await scanTree(root, name, maxEntries)).tree;
}

/** Como `buildTree`, diciendo además si se recortó (las estadísticas lo avisan). */
export async function scanTree(root: string, name: string, maxEntries: number): Promise<{ tree: CloudFolderDto; truncated: boolean }> {
  let count = 0;
  let truncated = false;

  const walk = async (dir: string, id: string, folderName: string): Promise<CloudFolderDto> => {
    const info = await stat(dir);
    const folder: CloudFolderDto = {
      kind: 'folder', id, name: folderName, createdAt: created(info), modifiedAt: info.mtime.toISOString(), children: [],
    };
    let entries: import('fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return folder; /* sin permiso de lectura: se ve vacía */
    }
    for (const entry of entries) {
      if (count >= maxEntries) { truncated = true; break; }
      if (!entry.isDirectory() && !entry.isFile()) continue;
      const childId = id ? `${id}/${entry.name}` : entry.name;
      const path = join(dir, entry.name);
      count++;
      try {
        if (entry.isDirectory()) {
          folder.children.push(await walk(path, childId, entry.name));
        } else {
          const s = await stat(path);
          const file: CloudEntryDto = {
            kind: 'file', id: childId, name: entry.name, type: fileTypeFromName(entry.name), size: s.size,
            createdAt: created(s), modifiedAt: s.mtime.toISOString(),
          };
          folder.children.push(file);
        }
      } catch {
        /* desapareció mientras se leía: se omite */
      }
    }
    return folder;
  };

  const tree = await walk(root, '', name);
  if (truncated) logger.warn(`El árbol de ${root} superó ${maxEntries} elementos y se recortó.`);
  return { tree, truncated };
}

/**
 * Todos los archivos regulares bajo `dir`, con su ruta relativa (para el zip).
 * Salta enlaces simbólicos y especiales; pasar de `maxEntries` (archivos y
 * carpetas) es un error 413 en vez de llenar la memoria.
 */
export async function listFiles(dir: string, prefix: string, maxEntries = Infinity): Promise<{ path: string; name: string }[]> {
  const out: { path: string; name: string }[] = [];
  let count = 0;
  const walk = async (current: string, base: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isFile()) continue;
      if (++count > maxEntries) {
        throw new HttpException({ code: 'TOO_MANY_FILES', message: `La carpeta tiene más de ${maxEntries} elementos y no se puede comprimir de una vez.`, hint: 'Descarga sus subcarpetas por separado.' }, HttpStatus.PAYLOAD_TOO_LARGE);
      }
      const path = join(current, entry.name);
      const name = `${base}/${entry.name}`;
      if (entry.isDirectory()) await walk(path, name);
      else out.push({ path, name });
    }
  };
  await walk(dir, prefix);
  return out;
}
