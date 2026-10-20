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

  async uploadStream(
    session: SftpSession,
    opts: {
      destDir: string;
      relPath: string;
      source: Readable;
      overwrite: boolean;
      /** Tamaño que declara el cliente; sirve para detectar una subida cortada */
      declaredSize?: number;
    },
  ): Promise<{ path: string; bytes: number; overwritten: boolean }> {
    const base = normalizeAbsolute(opts.destDir, session.home);
    const target = resolveInside(base, opts.relPath);

    /* Si el cliente ya avisa de que no cabe, se rechaza sin abrir nada en el servidor. */
    const declared = opts.declaredSize ?? this.contentLength(opts.source);
    if (declared !== undefined && declared > this.maxUploadBytes) {
      throw new PayloadTooLargeException('El archivo supera el tamaño máximo permitido');
    }

    await this.ensureDir(session, parentOf(target), base);

    const existing = await this.promisify<Stats>((cb) =>
      session.data.lstat(target, cb),
    ).catch(() => null);

    if (existing) {
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

    const counter = new ByteCounter(this.maxUploadBytes);
    /* `wx` (O_CREAT|O_EXCL) es el segundo cerrojo: entre el lstat de arriba y
       esta llamada cabe una carrera, y sin él se sobrescribiría a ciegas. */
    const writeStream = session.data.createWriteStream(target, {
      flags: opts.overwrite ? 'w' : 'wx',
      mode: 0o644,
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
        (opts.declaredSize !== undefined && counter.bytes !== opts.declaredSize);

      if (incomplete) {
        throw new BadRequestException('La subida se interrumpió antes de terminar');
      }
    } catch (error) {
      /* No dejar medio archivo: es peor que no tener nada, porque en el
         listado parece completo. Primero hay que cerrar el stream y esperar a
         que el canal SFTP se vacíe: si no, las escrituras que quedan en vuelo
         llegan DESPUÉS del unlink y vuelven a crear el archivo. */
      await this.closeStream(writeStream);
      await this.promisify<void>((cb) => session.data.unlink(target, cb)).catch(
        () => undefined,
      );
      throw this.translate(error);
    } finally {
      session.activeUploads--;
      session.lastUsedAt = Date.now();
    }

    this.logger.log(
      `⬆️  ${session.username}@${session.host}:${target} · ${counter.bytes} bytes (usuario ${session.userId})`,
    );

    return { path: target, bytes: counter.bytes, overwritten: Boolean(existing) };
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
