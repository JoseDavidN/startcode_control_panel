// src/sftp/services/sftp-operations.service.ts
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import archiver from 'archiver';
import { Readable, Transform, TransformCallback, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { posix } from 'path';
import type { FileEntryWithStats, Stats } from 'ssh2';
import { SftpEntry, SftpEntryType, SftpSession } from '../sftp.types';
import {
  assertSegment,
  formatMode,
  normalizeAbsolute,
  parentOf,
  resolveInside,
} from '../utils/remote-path.util';

const DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
/** Carpetas por lote de `mkdirp`: una subida de árbol real no se acerca. */
export const MAX_MKDIRP_DIRS = 10_000;

/** Trozo de lectura: 64 KB (lo de ssh2 por defecto) limita mucho con latencia alta. */
const READ_CHUNK_BYTES = 256 * 1024;
/** Sistemas de archivos virtuales: leerlos no acaba nunca o se queda colgado. */
const VIRTUAL_ROOTS = ['/proc', '/sys', '/dev'];
/** Tope de líneas de la lista de lo que no entró en un .zip. */
const MAX_SKIPPED_LISTED = 5000;
const SKIPPED_FILE = '_no-incluidos.txt';

const isVirtualPath = (path: string) =>
  VIRTUAL_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));

/**
 * Nombre seguro dentro de un .zip. En Linux, `..\\..\\x` es un nombre válido
 * que al descomprimir en Windows saldría de la carpeta de destino.
 */
const zipSegment = (name: string) =>
  // eslint-disable-next-line no-control-regex
  name.replace(/[\\\x00-\x1f\x7f]/g, '_');

/** Cabecera de descarga; el nombre va codificado, así no puede romper la cabecera. */
const attachment = (name: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;

/** Corta el stream en cuanto se pasa del límite, sin esperar al final. */
class ByteCounter extends Transform {
  bytes = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  _transform(chunk: Buffer, _encoding: string, callback: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) {
      callback(new PayloadTooLargeException('El archivo supera el tamaño máximo permitido'));
      return;
    }
    callback(null, chunk);
  }
}

/** La respuesta HTTP, en lo que la descarga necesita de ella. */
export type DownloadTarget = Writable & {
  setHeader(name: string, value: string): unknown;
};

@Injectable()
export class SftpOperationsService {
  private readonly logger = new Logger(SftpOperationsService.name);
  private readonly maxUploadBytes: number;

  constructor(config: ConfigService) {
    /* Un valor mal escrito en el .env (NaN, 0, negativo) dejaría la subida sin
       límite: `bytes > NaN` nunca es cierto. Entonces vale el de por defecto. */
    const configured = Number(config.get('SFTP_MAX_UPLOAD_BYTES', DEFAULT_MAX_UPLOAD_BYTES));
    this.maxUploadBytes =
      Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES;
  }

  /* ── Navegación ─────────────────────────────────────────────────── */

  async list(
    session: SftpSession,
    rawPath?: string,
  ): Promise<{ path: string; entries: SftpEntry[] }> {
    /* Se resuelve con realpath para que la barra de ruta muestre siempre la
       ruta canónica: si no, entrar en un enlace y pulsar «..» lleva a un sitio
       que no es el que el usuario ve. */
    const requested = normalizeAbsolute(rawPath || session.home, session.home);
    const path = await this.realpath(session, requested);

    const raw = await this.promisify<FileEntryWithStats[]>((cb) =>
      session.meta.readdir(path, cb),
    );

    const entries = await Promise.all(
      raw.map((item) => this.toEntry(session, path, item)),
    );

    entries.sort((a, b) => {
      const dirFirst = Number(b.type === 'dir') - Number(a.type === 'dir');
      return dirFirst || a.name.localeCompare(b.name, 'es', { numeric: true });
    });

    return { path, entries };
  }

  async realpath(session: SftpSession, rawPath: string): Promise<string> {
    const path = normalizeAbsolute(rawPath, session.home);
    const resolved = await this.promisify<string>((cb) =>
      session.meta.realpath(path, cb),
    );
    return normalizeAbsolute(resolved, session.home);
  }

  async mkdir(
    session: SftpSession,
    rawPath: string,
    name?: string,
  ): Promise<string> {
    const base = normalizeAbsolute(rawPath, session.home);
    const path = name ? posix.join(base, assertSegment(name)) : base;

    await this.promisify<void>((cb) => session.meta.mkdir(path, cb));
    session.ensuredDirs.add(path);

    return path;
  }

  /**
   * `mkdir -p` por el protocolo, nunca por shell: SFTP toma las rutas
   * literalmente, así que no hay forma de que un nombre de carpeta se
   * convierta en un comando.
   */
  async ensureDir(
    session: SftpSession,
    absDir: string,
    boundary: string,
  ): Promise<void> {
    if (session.ensuredDirs.has(absDir)) return;
    if (!absDir.startsWith(boundary)) {
      throw new BadRequestException('El directorio queda fuera del destino');
    }

    const rest = absDir.slice(boundary.length).split('/').filter(Boolean);
    let current = boundary;

    for (const segment of rest) {
      current = posix.join(current, segment);
      if (session.ensuredDirs.has(current)) continue;

      try {
        await this.promisify<void>((cb) => session.data.mkdir(current, cb));
      } catch {
        /* Puede existir ya, o haberlo creado otra subida en paralelo: solo es
           un problema si lo que hay no es un directorio. */
        const stats = await this.promisify<Stats>((cb) =>
          session.data.stat(current, cb),
        ).catch(() => null);

        if (!stats || !stats.isDirectory()) {
          throw new BadGatewayException(
            `No se pudo crear el directorio remoto ${current}`,
          );
        }
      }
      session.ensuredDirs.add(current);
    }
  }

  /** Crea todo el árbol de directorios de un lote antes de empezar a subir. */
  async mkdirp(
    session: SftpSession,
    baseDir: string,
    relDirs: string[],
  ): Promise<number> {
    if (!Array.isArray(relDirs) || relDirs.length > MAX_MKDIRP_DIRS) {
      throw new BadRequestException(`Se admiten hasta ${MAX_MKDIRP_DIRS} carpetas por lote`);
    }
    const base = normalizeAbsolute(baseDir, session.home);
    await this.ensureDir(session, base, '/');

    let created = 0;
    for (const rel of relDirs) {
      const target = resolveInside(base, rel);
      const before = session.ensuredDirs.size;
      await this.ensureDir(session, target, base);
      if (session.ensuredDirs.size > before) created++;
    }

    return created;
  }

  /* ── Subida ─────────────────────────────────────────────────────── */

  /**
   * Escribe un archivo o una parte de él. El cliente manda los archivos
   * grandes en partes consecutivas (`offset`, `total`): cada parte es una
   * petición corta que no choca con los tiempos máximos del servidor HTTP ni
   * de un proxy, y si una falla se reintenta solo esa.
   */
  async uploadStream(
    session: SftpSession,
    opts: {
      destDir: string;
      relPath: string;
      source: Readable;
      overwrite: boolean;
      /** Bytes que declara el cliente para este envío; detecta una subida cortada */
      declaredSize?: number;
      /** Posición de la parte; mayor que 0 continúa una subida de esta sesión */
      offset?: number;
      /** Tamaño final del archivo, si llega por partes */
      total?: number;
    },
  ): Promise<{ path: string; bytes: number; overwritten: boolean; complete: boolean }> {
    const base = normalizeAbsolute(opts.destDir, session.home);
    const target = resolveInside(base, opts.relPath);
    const offset = opts.offset ?? 0;
    const total = opts.total;

    /* Si el cliente ya avisa de que no cabe, se rechaza sin abrir nada en el servidor. */
    const declared = opts.declaredSize ?? this.contentLength(opts.source);
    if (
      (declared !== undefined && offset + declared > this.maxUploadBytes) ||
      (total !== undefined && total > this.maxUploadBytes)
    ) {
      throw new PayloadTooLargeException('El archivo supera el tamaño máximo permitido');
    }
    if (total !== undefined && offset > total) {
      throw new BadRequestException('La parte queda fuera del archivo');
    }

    let existing: Stats | null = null;

    if (offset > 0) {
      /* Continuar solo lo que esta sesión empezó y justo donde se quedó: así
         una parte no puede escribir en un archivo ajeno ni dejar huecos. */
      if (session.partials.get(target) !== offset) {
        throw new ConflictException('La subida no se puede continuar; empieza de nuevo');
      }
      const stats = await this.promisify<Stats>((cb) => session.data.lstat(target, cb)).catch(() => null);
      if (!stats || !stats.isFile()) {
        session.partials.delete(target);
        throw new ConflictException('El archivo a medias ya no está en el destino');
      }
    } else {
      await this.ensureDir(session, parentOf(target), base);

      existing = await this.promisify<Stats>((cb) =>
        session.data.lstat(target, cb),
      ).catch(() => null);

      if (existing && !session.partials.has(target)) {
        if (existing.isSymbolicLink()) {
          /* Escribir a través de un enlace acabaría tocando un archivo que el
             usuario no ve en la lista. */
          throw new ConflictException(
            'El destino es un enlace simbólico; bórralo antes de sobrescribir',
          );
        }
        if (!opts.overwrite) {
          throw new ConflictException('El archivo ya existe en el destino');
        }
      }
    }

    const counter = new ByteCounter(this.maxUploadBytes - offset);
    /* `wx` (O_CREAT|O_EXCL) es el segundo cerrojo: entre el lstat de arriba y
       esta llamada cabe una carrera, y sin él se sobrescribiría a ciegas. Una
       primera parte que se reintenta pisa su propio archivo a medias. Las
       siguientes escriben en su posición sin truncar. */
    const restarting = offset === 0 && session.partials.has(target);
    const writeStream = session.data.createWriteStream(target, {
      flags: offset > 0 ? 'r+' : opts.overwrite || restarting ? 'w' : 'wx',
      mode: 0o644,
      ...(offset > 0 ? { start: offset } : {}),
    });

    session.activeUploads++;
    try {
      await pipeline(opts.source, counter, writeStream);

      /* Si el cliente cancela, la petición HTTP se corta pero el stream
         termina sin error: sin esta comprobación el archivo quedaría a medias
         y, peor aún, se daría la subida por buena. `complete` es false cuando
         el mensaje no llegó entero; el tamaño declarado lo confirma. */
      const incomplete =
        (opts.source as Readable & { complete?: boolean }).complete === false ||
        (opts.declaredSize !== undefined && counter.bytes !== opts.declaredSize) ||
        (total !== undefined && offset + counter.bytes > total);

      if (incomplete) {
        throw new BadRequestException('La subida se interrumpió antes de terminar');
      }
    } catch (error) {
      /* Primero hay que cerrar el stream y esperar a que el canal SFTP se
         vacíe: si no, las escrituras que quedan en vuelo llegan DESPUÉS del
         unlink (o del recorte) y vuelven a escribir el archivo. */
      await this.closeStream(writeStream);
      if (offset > 0) {
        /* Se deja como estaba antes de esta parte, para poder reintentarla. */
        await this.promisify<void>((cb) =>
          session.data.setstat(target, { size: offset }, cb),
        ).catch(() => undefined);
      } else {
        /* No dejar medio archivo: en el listado parece completo. */
        session.partials.delete(target);
        await this.promisify<void>((cb) => session.data.unlink(target, cb)).catch(
          () => undefined,
        );
      }
      throw this.translate(error);
    } finally {
      session.activeUploads--;
      session.lastUsedAt = Date.now();
    }

    const written = offset + counter.bytes;
    const complete = total === undefined || written === total;
    const overwritten = offset > 0 ? false : Boolean(existing) && !restarting;

    if (!complete) {
      session.partials.set(target, written);
      return { path: target, bytes: counter.bytes, overwritten, complete };
    }

    session.partials.delete(target);
    this.logger.log(
      `⬆️  ${session.username}@${session.host}:${target} · ${written} bytes (usuario ${session.userId})`,
    );

    return { path: target, bytes: counter.bytes, overwritten, complete };
  }

  /**
   * Borra un archivo a medias que el cliente abandonó (cancelado o con
   * error). Solo los que esta sesión dejó sin terminar: no es un borrado
   * general.
   */
  async discardPartial(session: SftpSession, destDir: string, relPath: string): Promise<boolean> {
    const base = normalizeAbsolute(destDir, session.home);
    const target = resolveInside(base, relPath);
    if (!session.partials.has(target)) return false;

    session.partials.delete(target);
    await this.promisify<void>((cb) => session.data.unlink(target, cb)).catch(() => undefined);
    return true;
  }

  /* ── Descarga ───────────────────────────────────────────────────── */

  /** Qué hay en la ruta. Sigue los enlaces: descargar uno trae lo que apunta. */
  async downloadInfo(
    session: SftpSession,
    rawPath: string,
  ): Promise<{ path: string; name: string; kind: 'file' | 'dir'; size: number }> {
    const path = normalizeAbsolute(rawPath, session.home);
    const stats = await this.promisify<Stats>((cb) => session.meta.stat(path, cb));

    /* Una tubería o un dispositivo no tienen fin: leerlos dejaría la descarga colgada. */
    if (!stats.isFile() && !stats.isDirectory()) {
      throw new BadRequestException('Solo se pueden descargar archivos y carpetas');
    }

    return {
      path,
      name: posix.basename(path) || 'raiz',
      kind: stats.isDirectory() ? 'dir' : 'file',
      size: stats.isFile() ? stats.size ?? 0 : 0,
    };
  }

  /**
   * Escribe el archivo o la carpeta en la respuesta. Lo que falla antes de
   * empezar lanza (y llega como error HTTP). Después ya no hay forma de avisar:
   * se corta la conexión y el cliente, al recibir la respuesta incompleta,
   * descarta lo escrito.
   */
  async download(
    session: SftpSession,
    rawPath: string,
    res: DownloadTarget,
  ): Promise<void> {
    const info = await this.downloadInfo(session, rawPath);
    /* Abrir antes de responder: un permiso denegado aún puede ser un error HTTP. */
    const handle = info.kind === 'file' ? await this.openForRead(session, info.path) : null;

    session.activeDownloads++;
    session.lastUsedAt = Date.now();
    try {
      const bytes = handle
        ? await this.sendFile(session, info, handle, res)
        : await this.sendZip(session, info, res);
      this.logger.log(
        `⬇️  ${session.username}@${session.host}:${info.path} · ${bytes} bytes (usuario ${session.userId})`,
      );
    } catch (error) {
      /* El cliente canceló o se cayó el canal: no hay a quién contestarle. */
      this.logger.warn(
        `Descarga de ${info.path} cortada: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.destroy();
    } finally {
      session.activeDownloads--;
      session.lastUsedAt = Date.now();
    }
  }

  private async sendFile(
    session: SftpSession,
    info: { path: string; name: string; size: number },
    handle: Buffer,
    res: DownloadTarget,
  ): Promise<number> {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', attachment(info.name));
    /* Solo con tamaño: un archivo que dice medir 0 (los de /proc) puede tener
       contenido, y uno que crece (un log) se corta en lo anunciado para que la
       respuesta coincida con su `Content-Length`. */
    if (info.size > 0) res.setHeader('Content-Length', String(info.size));

    const counter = new ByteCounter(Number.MAX_SAFE_INTEGER);
    await pipeline(
      session.data.createReadStream(info.path, {
        handle,
        highWaterMark: READ_CHUNK_BYTES,
        ...(info.size > 0 ? { end: info.size - 1 } : {}),
      }),
      counter,
      res,
    );
    return counter.bytes;
  }

  /**
   * Comprime la carpeta mientras la recorre, un archivo cada vez: ni ocupa
   * memoria ni abre miles de archivos a la vez en el servidor. Lo que no se
   * puede leer no tira la descarga: queda en `_no-incluidos.txt`, en la raíz
   * del .zip. Los enlaces simbólicos tampoco entran: seguirlos puede dar ciclos
   * o traer medio disco, y un enlace dentro de un .zip puede hacer que al
   * descomprimir se escriba fuera de la carpeta.
   */
  private async sendZip(
    session: SftpSession,
    info: { path: string; name: string },
    res: DownloadTarget,
  ): Promise<number> {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', attachment(`${info.name}.zip`));

    const archive = archiver('zip', { zlib: { level: 6 } });
    const counter = new ByteCounter(Number.MAX_SAFE_INTEGER);
    const sent = pipeline(archive, counter, res);

    /* Si la respuesta se cae, la espera de cada entrada no terminaría nunca. */
    let failure: Error | null = null;
    /* El que se está leyendo: al abortar hay que soltar su handle en el servidor. */
    let reading: Readable | null = null;
    const stopped = sent.catch((error: Error) => {
      failure = error;
      archive.abort();
      reading?.destroy();
    });

    const skipped: string[] = [];
    let skippedCount = 0;
    const skip = (path: string, reason: string) => {
      skippedCount++;
      if (skipped.length < MAX_SKIPPED_LISTED) skipped.push(`${path}: ${reason}`);
    };

    const nextEntry = () =>
      Promise.race([
        new Promise<void>((resolve) => archive.once('entry', () => resolve())),
        stopped,
      ]);

    const pending: { path: string; rel: string }[] = [
      { path: info.path, rel: zipSegment(info.name) },
    ];

    while (pending.length > 0 && !failure && !session.closing) {
      const dir = pending.pop()!;
      if (isVirtualPath(dir.path)) {
        skip(dir.path, 'sistema de archivos virtual');
        continue;
      }

      let items: FileEntryWithStats[];
      try {
        items = await this.promisify<FileEntryWithStats[]>((cb) =>
          session.data.readdir(dir.path, cb),
        );
      } catch (error) {
        skip(dir.path, this.reason(error));
        continue;
      }

      /* Una carpeta vacía también es parte del árbol. */
      if (items.length === 0) {
        const entry = nextEntry();
        archive.append(Buffer.alloc(0), { name: `${dir.rel}/` });
        await entry;
      }

      for (const item of items) {
        if (failure || session.closing) break;
        session.lastUsedAt = Date.now();
        const path = posix.join(dir.path, item.filename);
        const rel = `${dir.rel}/${zipSegment(item.filename)}`;

        if (item.attrs.isDirectory()) {
          pending.push({ path, rel });
        } else if (item.attrs.isSymbolicLink()) {
          skip(path, 'enlace simbólico');
        } else if (!item.attrs.isFile()) {
          skip(path, 'no es un archivo normal');
        } else if (isVirtualPath(path)) {
          skip(path, 'sistema de archivos virtual');
        } else {
          let handle: Buffer;
          try {
            handle = await this.openForRead(session, path);
          } catch (error) {
            skip(path, this.reason(error));
            continue;
          }
          const entry = nextEntry();
          reading = session.data.createReadStream(path, { handle, highWaterMark: READ_CHUNK_BYTES });
          archive.append(
            reading,
            {
              name: rel,
              date: new Date((item.attrs.mtime ?? 0) * 1000),
              mode: item.attrs.mode & 0o777,
            },
          );
          await entry;
        }
      }
    }

    if (session.closing) failure = new Error('la sesión SFTP se cerró');
    if (failure) {
      archive.abort();
      await stopped;
      throw failure;
    }

    if (skippedCount > 0) {
      const more = skippedCount - skipped.length;
      archive.append(
        `No se incluyeron ${skippedCount} elementos:\n\n${skipped.join('\n')}\n${
          more > 0 ? `… y ${more} más\n` : ''
        }`,
        { name: SKIPPED_FILE },
      );
    }

    void archive.finalize();
    await sent;
    return counter.bytes;
  }

  private openForRead(session: SftpSession, path: string): Promise<Buffer> {
    return this.promisify<Buffer>((cb) => session.data.open(path, 'r', cb));
  }

  /** El motivo en palabras, para la lista de lo que no entró en el .zip. */
  private reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /* ── Internos ───────────────────────────────────────────────────── */

  /** `Content-Length` de la petición, si viene y es un número. */
  private contentLength(source: Readable): number | undefined {
    const header = (source as Readable & { headers?: Record<string, unknown> }).headers?.['content-length'];
    const value = typeof header === 'string' ? Number(header) : NaN;
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }

  /** Cierra un stream de escritura y espera a que el canal lo confirme. */
  private closeStream(stream: Writable): Promise<void> {
    return new Promise<void>((resolve) => {
      if (stream.destroyed) return resolve();

      /* Red de seguridad: si el canal no confirma, seguir igualmente en vez de
         dejar la petición colgada. */
      const timer = setTimeout(resolve, 5000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };

      stream.once('close', done);
      stream.once('error', done);
      stream.destroy();
    });
  }

  private async toEntry(
    session: SftpSession,
    dir: string,
    item: FileEntryWithStats,
  ): Promise<SftpEntry> {
    const path = posix.join(dir, item.filename);
    const attrs = item.attrs;
    const type = this.typeOf(attrs);

    const entry: SftpEntry = {
      name: item.filename,
      path,
      type,
      size: attrs.size ?? 0,
      mode: attrs.mode ?? 0,
      permissions: formatMode(attrs.mode ?? 0),
      mtime: (attrs.mtime ?? 0) * 1000,
      uid: attrs.uid ?? 0,
      gid: attrs.gid ?? 0,
    };

    if (type === 'symlink') {
      const stats = await this.promisify<Stats>((cb) =>
        session.meta.stat(path, cb),
      ).catch(() => null);
      entry.linkType = stats ? this.typeOf(stats) : 'broken';
    }

    return entry;
  }

  private typeOf(attrs: {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }): SftpEntryType {
    if (attrs.isDirectory()) return 'dir';
    if (attrs.isSymbolicLink()) return 'symlink';
    if (attrs.isFile()) return 'file';
    return 'other';
  }

  private promisify<T>(
    fn: (cb: (err: Error | null | undefined, result: T) => void) => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      fn((err, result) => (err ? reject(this.translate(err)) : resolve(result)));
    });
  }

  /** Los errores de ssh2 llegan en inglés y con códigos: se traducen una vez. */
  private translate(error: unknown): Error {
    if (
      error instanceof ConflictException ||
      error instanceof BadRequestException ||
      error instanceof PayloadTooLargeException ||
      error instanceof BadGatewayException
    ) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (/no such file|ENOENT/i.test(message)) {
      return new BadRequestException('La ruta no existe en el servidor');
    }
    if (/permission denied|EACCES/i.test(message)) {
      return new BadGatewayException('Permiso denegado en el servidor');
    }
    if (/no space left|ENOSPC/i.test(message)) {
      return new BadGatewayException('No queda espacio en el servidor');
    }
    if (/file already exists|EEXIST/i.test(message)) {
      return new ConflictException('El archivo ya existe en el destino');
    }

    return new BadGatewayException(`Error SFTP: ${message}`);
  }
}
