import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import archiver from 'archiver';
import { randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { cp, lstat, mkdir, rename, rm, stat, statfs, unlink } from 'fs/promises';
import { dirname, join } from 'path';
import { Transform, type Readable, type Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { CloudConfig } from '@/common/cloud-config';
import { cloudError, translateFsError } from '@/common/errors';
import type { Section } from '@/common/sections';
import { PathsService } from '@/paths/paths.service';
import { mimeFromName } from './file-types';
import { assertName, assertNoSymlinks, joinInside, parseRelative } from './path-guard';
import { buildTree, listFiles } from './tree';

const LABEL: Record<Section, string> = { home: 'Home', backups: 'Backups' };

/** Corta la subida si pasa del máximo, sin esperar a que termine. */
class ByteCounter extends Transform {
  bytes = 0;
  constructor(private readonly max: number) { super(); }
  _transform(chunk: Buffer, _enc: BufferEncoding, done: (error?: Error | null, data?: Buffer) => void) {
    this.bytes += chunk.length;
    if (this.bytes > this.max) {
      done(new HttpException({ code: 'TOO_LARGE', message: 'El archivo supera el tamaño máximo que admite la nube.' }, HttpStatus.PAYLOAD_TOO_LARGE));
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

  constructor(
    private readonly config: CloudConfig,
    private readonly paths: PathsService,
  ) {}

  /** Raíz de la sección del usuario; se crea si aún no existe. */
  private async root(username: string, section: Section): Promise<string> {
    const root = this.paths.get(username)[section];
    try {
      await mkdir(root, { recursive: true });
    } catch (error) {
      throw translateFsError(error, `la carpeta de ${LABEL[section]}`);
    }
    return root;
  }

  private async locate(username: string, section: Section, rel: string | undefined) {
    const root = await this.root(username, section);
    const segments = parseRelative(rel);
    await assertNoSymlinks(root, segments);
    return { root, segments, full: joinInside(root, segments) };
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

  async tree(username: string, section: Section) {
    const root = await this.root(username, section);
    try {
      return await buildTree(root, LABEL[section], this.config.treeMaxEntries);
    } catch (error) {
      throw translateFsError(error, `la carpeta de ${LABEL[section]}`);
    }
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
  async upload(username: string, section: Section, parent: string | undefined, relPath: string, size: number | undefined, source: Readable & { complete?: boolean }) {
    const root = await this.root(username, section);
    const segments = [...parseRelative(parent), ...parseRelative(relPath)];
    if (segments.length === 0) throw cloudError(BadRequestException, 'INVALID_PATH', 'Falta el nombre del archivo.');
    await assertNoSymlinks(root, segments);
    const target = joinInside(root, segments);
    if (await this.exists(target) && (await lstat(target)).isDirectory()) {
      throw cloudError(ConflictException, 'ALREADY_EXISTS', `Ya existe una carpeta llamada «${segments[segments.length - 1]}».`);
    }
    const tmp = join(dirname(target), `.${segments[segments.length - 1]}.${randomUUID()}.part`);
    const counter = new ByteCounter(this.config.maxUploadBytes);
    try {
      await mkdir(dirname(target), { recursive: true });
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
      return { stream: createReadStream(full), size: info.size, name, type: mimeFromName(name) };
    } catch (error) {
      throw translateFsError(error, 'el archivo');
    }
  }

  /** Carpeta comprimida en .zip, escrita directamente en la respuesta. */
  async zip(username: string, section: Section, rel: string | undefined, out: Writable & { setHeader(name: string, value: string): void }) {
    const { full, segments } = await this.locate(username, section, rel);
    const name = segments.length ? segments[segments.length - 1] : LABEL[section];
    let files: { path: string; name: string }[];
    try {
      if (!(await stat(full)).isDirectory()) throw Object.assign(new Error(), { code: 'ENOTDIR' });
      files = await listFiles(full, name);
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
      if (!caseOnly && await this.exists(target)) throw Object.assign(new Error(), { code: 'EEXIST' });
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
