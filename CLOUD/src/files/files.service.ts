import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import archiver from 'archiver';
import { randomUUID } from 'crypto';
import { constants as fsConstants, createReadStream, createWriteStream } from 'fs';
import { cp, lstat, mkdir, rename, rm, stat, statfs, unlink } from 'fs/promises';
import type { IncomingHttpHeaders } from 'http';
import { dirname, join } from 'path';
import { Transform, type Readable, type Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { CloudConfig } from '@/common/cloud-config';
import { cloudError, translateFsError } from '@/common/errors';
import type { Section } from '@/common/sections';
import { PathsService } from '@/paths/paths.service';
import { mimeFromName } from './file-types';
import { assertInsideRoot, assertName, assertNoSymlinks, assertRootAllowed, joinInside, parseRelative } from './path-guard';
import type { CloudFolderDto } from './files.types';
import { buildTree, listFiles, scanTree } from './tree';
import { aggregateStats, type CloudStatsDto } from './stats';

const LABEL: Record<Section, string> = { home: 'Home', backups: 'Backups' };

/* El dashboard pide las estadísticas a menudo y recorrer el disco cuesta: se reutilizan un minuto. */
const STATS_TTL_MS = 60_000;

/* Lectura sin seguir un enlace simbólico en el último tramo (el resto ya lo
   comprobó path-guard): si alguien lo cambia entre medias, falla. */
const READ_NOFOLLOW = (fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW) as unknown as string; /* Node acepta flags numéricos; los tipos solo dicen string. */

/* Un .zip recorre la carpeta entera antes de empezar: más de esto es casi
   seguro un error (y cuesta memoria). El árbol ya se recorta en `treeMaxEntries`. */
const ZIP_ENTRIES_PER_TREE_ENTRY = 10;

const tooLarge = () =>
  new HttpException({ code: 'TOO_LARGE', message: 'El archivo supera el tamaño máximo que admite la nube.' }, HttpStatus.PAYLOAD_TOO_LARGE);

/** Tamaño de `Content-Length`, si viene y es un número. */
const contentLength = (headers: IncomingHttpHeaders | undefined) => {
  const raw = headers?.['content-length'];
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : undefined;
};

/** Corta la subida si pasa del máximo, sin esperar a que termine. */
class ByteCounter extends Transform {
  bytes = 0;
  constructor(private readonly max: number) { super(); }
  _transform(chunk: Buffer, _enc: BufferEncoding, done: (error?: Error | null, data?: Buffer) => void) {
    this.bytes += chunk.length;
    if (this.bytes > this.max) {
      done(tooLarge());
      return;
    }
    done(null, chunk);
  }
}

/** `attachment` con el nombre en UTF-8 (tildes y espacios incluidos). */
export const contentDisposition = (name: string) =>
  `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/**
 * Operaciones sobre los archivos de Home y Backups de cada usuario, en el
 * disco del servidor. Toda ruta pasa por path-guard.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  /* Por usuario; la promesa, para que dos peticiones a la vez recorran el disco una sola vez. */
  private readonly statsCache = new Map<string, { at: number; value: Promise<CloudStatsDto> }>();
  /* Un árbol en curso por usuario y sección: pedirlo muchas veces seguidas no multiplica el recorrido. */
  private readonly treeRunning = new Map<string, Promise<CloudFolderDto>>();

  constructor(
    private readonly config: CloudConfig,
    private readonly paths: PathsService,
  ) {}

  /** Raíz de la sección del usuario; se crea si aún no existe. */
  private async root(username: string, section: Section): Promise<string> {
    const root = this.paths.get(username)[section];
    try {
      await mkdir(root, { recursive: true });
      await assertRootAllowed(root, this.config.allowedRoots);
    } catch (error) {
      throw translateFsError(error, `la carpeta de ${LABEL[section]}`);
    }
    return root;
  }

  private async locate(username: string, section: Section, rel: string | undefined) {
    const root = await this.root(username, section);
    const segments = parseRelative(rel);
    await assertNoSymlinks(root, segments);
    const full = joinInside(root, segments);
    await assertInsideRoot(root, full);
    return { root, segments, full };
  }

  private async locateEntry(username: string, section: Section, rel: string) {
    const found = await this.locate(username, section, rel);
    if (found.segments.length === 0) {
      throw cloudError(BadRequestException, 'ROOT_FORBIDDEN', `No se puede modificar la carpeta raíz de ${LABEL[section]}.`);
    }
    return found;
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch {
      return false;
    }
  }

  /** Dos rutas que son el mismo archivo (disco que no distingue mayúsculas). */
  private async sameEntry(a: string, b: string): Promise<boolean> {
    const [x, y] = await Promise.all([lstat(a), lstat(b)]);
    return x.dev === y.dev && x.ino === y.ino;
  }

  tree(username: string, section: Section): Promise<CloudFolderDto> {
    const key = `${username}\0${section}`;
    const running = this.treeRunning.get(key);
    if (running) return running;
    const value = (async () => {
      const root = await this.root(username, section);
      try {
        return await buildTree(root, LABEL[section], this.config.treeMaxEntries);
      } catch (error) {
        throw translateFsError(error, `la carpeta de ${LABEL[section]}`);
      }
    })().finally(() => this.treeRunning.delete(key));
    this.treeRunning.set(key, value);
    return value;
  }

  /** Resumen para el dashboard del panel (ver `aggregateStats`). */
  stats(username: string): Promise<CloudStatsDto> {
    const hit = this.statsCache.get(username);
    if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.value;
    const value = (async () => {
      const [home, backups] = await Promise.all((['home', 'backups'] as const).map(async section => {
        try {
          return await scanTree(await this.root(username, section), LABEL[section], this.config.treeMaxEntries);
        } catch (error) {
          throw translateFsError(error, `la carpeta de ${LABEL[section]}`);
        }
      }));
      return aggregateStats({ home: home.tree, backups: backups.tree }, home.truncated || backups.truncated);
    })();
    this.statsCache.set(username, { at: Date.now(), value });
    /* Un fallo no se queda en caché. */
    value.catch(() => this.statsCache.delete(username));
    return value;
  }

  /** Espacio del disco donde vive Home. */
  async storage(username: string) {
    const root = await this.root(username, 'home');
    const fs = await statfs(root);
    const total = fs.blocks * fs.bsize;
    return { total, used: total - fs.bavail * fs.bsize };
  }

  async createFolder(username: string, section: Section, parent: string | undefined, name: string) {
    assertName(name);
    const { segments, full } = await this.locate(username, section, parent);
    try {
      if (!(await stat(full)).isDirectory()) throw Object.assign(new Error(), { code: 'ENOTDIR' });
      await mkdir(join(full, name));
    } catch (error) {
      throw translateFsError(error, 'una carpeta');
    }
    return { id: [...segments, name].join('/') };
  }

  /**
   * Recibe el cuerpo crudo de la petición y lo escribe en streaming: primero
   * a un temporal en la misma carpeta y al final se renombra, así un corte
   * no deja un archivo a medias ni pisa el anterior hasta completar.
   */
  async upload(
    username: string, section: Section, parent: string | undefined, relPath: string, size: number | undefined,
    source: Readable & { complete?: boolean; headers?: IncomingHttpHeaders },
  ) {
    /* Solo cuerpo crudo: con JSON o un formulario, Express ya se lo comió y
       se guardaría un archivo vacío encima del que hubiera. */
    const type = source.headers?.['content-type']?.split(';')[0].trim().toLowerCase();
    if (type !== undefined && type !== 'application/octet-stream') {
      throw new HttpException({ code: 'UNSUPPORTED_TYPE', message: 'La subida debe enviarse como application/octet-stream.' }, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
    /* Lo declarado ya pasa del máximo: se rechaza sin leer nada. */
    const declared = size ?? contentLength(source.headers);
    if (declared !== undefined && declared > this.config.maxUploadBytes) throw tooLarge();
    const root = await this.root(username, section);
    const segments = [...parseRelative(parent), ...parseRelative(relPath)];
    if (segments.length === 0) throw cloudError(BadRequestException, 'INVALID_PATH', 'Falta el nombre del archivo.');
    await assertNoSymlinks(root, segments);
    const target = joinInside(root, segments);
    await assertInsideRoot(root, target);
    if (await this.exists(target) && (await lstat(target)).isDirectory()) {
      throw cloudError(ConflictException, 'ALREADY_EXISTS', `Ya existe una carpeta llamada «${segments[segments.length - 1]}».`);
    }
    const tmp = join(dirname(target), `.${segments[segments.length - 1]}.${randomUUID()}.part`);
    const counter = new ByteCounter(this.config.maxUploadBytes);
    try {
      await mkdir(dirname(target), { recursive: true });
      if (declared !== undefined) {
        const disk = await statfs(dirname(target));
        if (declared > disk.bavail * disk.bsize) throw Object.assign(new Error(), { code: 'ENOSPC' });
      }
      await pipeline(source, counter, createWriteStream(tmp, { flags: 'wx', mode: 0o644 }) as Writable);
      if (source.complete === false || (size !== undefined && counter.bytes !== size)) {
        throw cloudError(BadRequestException, 'INCOMPLETE', 'La subida se cortó antes de terminar.', 'Vuelve a cargar el archivo.');
      }
      await rename(tmp, target);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw translateFsError(error, 'el archivo');
    }
    return { id: segments.join('/'), size: counter.bytes };
  }

  async content(username: string, section: Section, rel: string) {
    const { full, segments } = await this.locateEntry(username, section, rel);
    try {
      const info = await stat(full);
      if (!info.isFile()) throw Object.assign(new Error(), { code: 'EISDIR' });
      const name = segments[segments.length - 1];
      return { stream: createReadStream(full, { flags: READ_NOFOLLOW }), size: info.size, name, type: mimeFromName(name) };
    } catch (error) {
      throw translateFsError(error, 'el archivo');
    }
  }

  /** Tamaño de un archivo propio de la nube (caché de videos), o null si ya no está. */
  async sizeOf(full: string): Promise<number | null> {
    return stat(full).then(s => (s.isFile() ? s.size : null), () => null);
  }

  /** Ruta absoluta y datos de un archivo (no carpeta), ya validada por path-guard. */
  async resolveFile(username: string, section: Section, rel: string) {
    const { full, segments } = await this.locateEntry(username, section, rel);
    try {
      const info = await stat(full);
      if (!info.isFile()) throw Object.assign(new Error(), { code: 'EISDIR' });
      return { full, name: segments[segments.length - 1], size: info.size, mtimeMs: info.mtimeMs };
    } catch (error) {
      throw translateFsError(error, 'el archivo');
    }
  }

  /**
   * Archivo para reproducir: entero o el tramo que pida la cabecera `Range`
   * (`bytes=inicio-fin`, `bytes=inicio-`, `bytes=-últimos`). Así un video
   * empieza a verse sin descargarlo y saltar a un minuto pide solo ese tramo.
   * `null` en `range` si el tramo no es satisfacible (416).
   */
  async openRange(username: string, section: Section, rel: string, header: string | undefined) {
    const file = await this.resolveFile(username, section, rel);
    return openFileRange(file.full, file.size, mimeFromName(file.name), header);
  }

  /** Carpeta comprimida en .zip, escrita directamente en la respuesta. */
  async zip(username: string, section: Section, rel: string | undefined, out: Writable & { setHeader(name: string, value: string): void }) {
    const { full, segments } = await this.locate(username, section, rel);
    const name = segments.length ? segments[segments.length - 1] : LABEL[section];
    let files: { path: string; name: string }[];
    try {
      if (!(await stat(full)).isDirectory()) throw Object.assign(new Error(), { code: 'ENOTDIR' });
      files = await listFiles(full, name, this.config.treeMaxEntries * ZIP_ENTRIES_PER_TREE_ENTRY);
    } catch (error) {
      throw translateFsError(error, 'la carpeta');
    }
    out.setHeader('Content-Type', 'application/zip');
    out.setHeader('Content-Disposition', contentDisposition(`${name}.zip`));
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', warning => this.logger.warn(`zip: ${warning.message}`));
    for (const file of files) archive.file(file.path, { name: file.name });
    void archive.finalize();
    try {
      await pipeline(archive, out);
    } catch (error) {
      this.logger.warn(`El zip de ${full} se cortó: ${(error as Error).message}`);
    }
  }

  async rename(username: string, section: Section, rel: string, name: string) {
    assertName(name);
    const { root, segments, full } = await this.locateEntry(username, section, rel);
    const nextSegments = [...segments.slice(0, -1), name];
    const target = joinInside(root, nextSegments);
    if (target === full) return { id: nextSegments.join('/') };
    try {
      await lstat(full);
      /* Solo cambia mayúsculas/minúsculas: en discos que no las distinguen el destino "existe" y es el mismo. */
      const caseOnly = target.toLowerCase() === full.toLowerCase();
      /* En un disco que sí las distingue, `A.txt` puede ser otro archivo: no se pisa. */
      if (await this.exists(target) && (!caseOnly || !(await this.sameEntry(full, target)))) {
        throw Object.assign(new Error(), { code: 'EEXIST' });
      }
      await rename(full, target);
    } catch (error) {
      throw translateFsError(error, 'un elemento');
    }
    return { id: nextSegments.join('/') };
  }

  async move(username: string, section: Section, rel: string, toSection: Section, toParent: string | undefined) {
    const from = await this.locateEntry(username, section, rel);
    const dest = await this.locate(username, toSection, toParent);
    const name = from.segments[from.segments.length - 1];
    const target = join(dest.full, name);
    const destPrefix = dest.full + '/';
    if (dest.full === from.full || destPrefix.startsWith(from.full + '/')) {
      throw cloudError(BadRequestException, 'MOVE_INTO_ITSELF', 'Una carpeta no se puede mover dentro de sí misma.');
    }
    if (target === from.full) return { id: from.segments.join('/') };
    try {
      if (!(await stat(dest.full)).isDirectory()) throw Object.assign(new Error(), { code: 'ENOTDIR' });
      if (await this.exists(target)) throw Object.assign(new Error(), { code: 'EEXIST' });
      try {
        await rename(from.full, target);
      } catch (error) {
        /* Home y Backups pueden estar en discos distintos: se copia y se borra. */
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
        await cp(from.full, target, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
        await rm(from.full, { recursive: true });
      }
    } catch (error) {
      throw translateFsError(error, 'un elemento');
    }
    return { id: [...dest.segments, name].join('/') };
  }

  async remove(username: string, section: Section, rel: string) {
    const { full } = await this.locateEntry(username, section, rel);
    try {
      await lstat(full);
      await rm(full, { recursive: true });
    } catch (error) {
      throw translateFsError(error, 'el elemento');
    }
  }
}

/**
 * Cabecera `Range` de un solo tramo. `undefined`: sin cabecera (o con varios
 * tramos, que no se admiten) → archivo entero. `null`: fuera del archivo.
 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!m || (!m[1] && !m[2])) return undefined;
  let start: number;
  let end: number;
  if (!m[1]) {
    /* Los últimos N bytes. */
    const suffix = Number(m[2]);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return null;
  return { start, end };
}

/** Tramo de un archivo ya localizado (también los videos convertidos en caché). */
export function openFileRange(full: string, size: number, type: string, header: string | undefined) {
  const range = parseRange(header, size);
  if (range === null) return { size, type, range: null, stream: null };
  const { start, end } = range ?? { start: 0, end: size - 1 };
  /* Un archivo vacío no tiene bytes que leer (createReadStream con end -1 fallaría). */
  const stream = size === 0 ? null : createReadStream(full, { flags: READ_NOFOLLOW, start, end, highWaterMark: 256 * 1024 });
  return { size, type, range: range ?? undefined, start, end, stream };
}
