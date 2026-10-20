import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdir, readdir, rename, rm, stat, utimes } from 'fs/promises';
import { setPriority } from 'os';
import { join } from 'path';
import { CloudConfig } from '@/common/cloud-config';
import { MediaService, type MediaFile } from '@/files/media.service';
import { fileTypeFromName } from '@/files/file-types';
import { nativeFallback, thumbFormat, thumbnailArgs } from '@/files/thumbnail-plan';

const THUMB_TIMEOUT_MS = 20_000;
/* Varias a la vez: una carpeta de fotos pide decenas seguidas. */
const MAX_PARALLEL = 3;
/* Segundo del video del que se saca la portada; si dura menos, el primero. */
const VIDEO_SEEK = 3;
const LOW_PRIORITY = 10;
/* Cada cuántas miniaturas nuevas se revisa el tamaño de la caché. */
const TRIM_EVERY = 100;

export type Thumbnail =
  | { kind: 'file'; path: string; type: string }
  /** Sin ffmpeg: el original es una imagen pequeña que el webview pinta. */
  | { kind: 'original' };

/**
 * Miniaturas de imágenes y portadas de videos, hechas con ffmpeg a prioridad
 * baja y guardadas en disco por ruta, tamaño y fecha: cambiar el archivo
 * genera otra. Las peticiones iguales a la vez comparten trabajo.
 */
@Injectable()
export class ThumbnailService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailService.name);
  private readonly pending = new Map<string, Promise<Thumbnail | null>>();
  private readonly queue: (() => void)[] = [];
  private running = 0;
  private created = 0;

  constructor(
    private readonly config: CloudConfig,
    private readonly media: MediaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await mkdir(this.config.thumbCacheDir, { recursive: true }).catch(() => undefined);
    const names = await readdir(this.config.thumbCacheDir).catch(() => [] as string[]);
    await Promise.all(names.filter(n => n.endsWith('.part')).map(n => rm(join(this.config.thumbCacheDir, n), { force: true })));
  }

  /** `null`: no se pudo sacar (formato que ffmpeg no lee, archivo dañado, sin ffmpeg). */
  async get(file: MediaFile): Promise<Thumbnail | null> {
    if (!(await this.media.hasFfmpeg())) return nativeFallback(file.name, file.size) ? { kind: 'original' } : null;

    const format = thumbFormat(file.name);
    const key = createHash('sha256').update(`${file.full}\0${file.size}\0${file.mtimeMs}`).digest('hex').slice(0, 40);
    const path = join(this.config.thumbCacheDir, `${key}.${format}`);
    const type = format === 'png' ? 'image/png' : 'image/jpeg';

    if (await stat(path).then(s => s.isFile() && s.size > 0, () => false)) {
      const now = new Date();
      await utimes(path, now, now).catch(() => undefined);
      return { kind: 'file', path, type };
    }

    let job = this.pending.get(key);
    if (!job) {
      job = this.limited(() => this.create(file, path, format))
        .then(ok => (ok ? { kind: 'file' as const, path, type } : null))
        .finally(() => this.pending.delete(key));
      this.pending.set(key, job);
    }
    return job;
  }

  private async create(file: MediaFile, path: string, format: 'jpg' | 'png'): Promise<boolean> {
    const part = `${path}.${process.pid}.${Date.now()}.part`;
    const video = fileTypeFromName(file.name) === 'video';
    /* Un video más corto que el salto no da fotograma: se repite desde el principio. */
    let ok = await this.run(thumbnailArgs(file.full, part, format, video ? VIDEO_SEEK : 0), part);
    if (!ok && video) ok = await this.run(thumbnailArgs(file.full, part, format, 0), part);
    if (!ok) {
      await rm(part, { force: true });
      return false;
    }
    await rename(part, path);
    if (++this.created % TRIM_EVERY === 0) void this.trimCache();
    return true;
  }

  private run(args: string[], output: string): Promise<boolean> {
    return new Promise(resolve => {
      const p = spawn(this.config.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      try { if (p.pid) setPriority(p.pid, LOW_PRIORITY); } catch { /* sin permiso: prioridad normal */ }
      let stderr = '';
      p.stderr?.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-500); });
      const timer = setTimeout(() => p.kill('SIGKILL'), THUMB_TIMEOUT_MS);
      p.on('error', () => { clearTimeout(timer); resolve(false); });
      p.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) {
          this.logger.debug(`miniatura ${args[args.indexOf('-i') + 1]}: ${stderr.trim().split('\n').pop() ?? code}`);
          resolve(false);
          return;
        }
        /* ffmpeg puede salir con 0 sin escribir nada (salto más allá del final). */
        void stat(output).then(s => resolve(s.size > 0), () => resolve(false));
      });
    });
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_PARALLEL) await new Promise<void>(resolve => this.queue.push(resolve));
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }

  /** Mantiene la caché bajo `CLOUD_THUMB_CACHE_BYTES`, quitando lo menos visto. */
  private async trimCache(): Promise<void> {
    const dir = this.config.thumbCacheDir;
    const names = (await readdir(dir).catch(() => [] as string[])).filter(n => !n.endsWith('.part'));
    const files = (await Promise.all(names.map(async n => {
      const s = await stat(join(dir, n)).catch(() => null);
      return s ? { path: join(dir, n), size: s.size, mtime: s.mtimeMs } : null;
    }))).filter((f): f is { path: string; size: number; mtime: number } => f !== null);
    let total = files.reduce((sum, f) => sum + f.size, 0);
    for (const f of files.sort((a, b) => a.mtime - b.mtime)) {
      if (total <= this.config.thumbCacheBytes) break;
      await rm(f.path, { force: true });
      total -= f.size;
    }
  }
}
