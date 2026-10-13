import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { createWriteStream, type WriteStream } from 'fs';
import { mkdir, readdir, rename, rm, stat, utimes } from 'fs/promises';
import { setPriority } from 'os';
import { join } from 'path';
import type { Response } from 'express';
import { CloudConfig } from '@/common/cloud-config';
import { ffmpegArgs, planPlayback, type ClientCaps, type PlaybackPlan, type ProbeResult } from './media-plan';

const PROBE_TIMEOUT_MS = 15_000;
const PROBE_CACHE_MAX = 500;
/* Prioridad baja (nice 10): el resto del servidor va primero. */
const LOW_PRIORITY = 10;

export interface MediaFile {
  full: string;
  name: string;
  size: number;
  mtimeMs: number;
}

/** Lo que la nube decidió para un video: plan y, si ya está convertido, la copia en caché. */
export interface PlaybackDecision {
  plan: PlaybackPlan;
  /** Clave de la copia convertida (exista ya o no). */
  cacheKey: string | null;
  cached: boolean;
  ffmpeg: boolean;
}

/** Una reproducción en curso con ffmpeg. */
interface Session {
  proc: ChildProcess;
  heavy: boolean;
}

/**
 * Reproducción de cualquier formato con ffmpeg, con la menor carga posible:
 * - ffprobe decide (`planPlayback`) y su resultado se recuerda por archivo.
 * - Lo compatible no pasa por ffmpeg; re-empaquetar copia los códecs.
 * - Convertir usa `veryfast`, hilos limitados, prioridad baja y como mucho
 *   `CLOUD_MAX_TRANSCODES` a la vez. ffmpeg escribe al ritmo que lee el
 *   reproductor (contrapresión del socket) y muere al cerrar el video o saltar.
 * - Una conversión vista de principio a fin queda en caché como MP4 normal:
 *   la siguiente vez se sirve a tramos, sin ffmpeg.
 */
@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);
  private readonly probes = new Map<string, ProbeResult>();
  /* Por id de reproducción (uno por video abierto): al saltar, la anterior muere. */
  private readonly sessions = new Map<string, Session>();
  private available: Promise<boolean> | null = null;

  constructor(private readonly config: CloudConfig) {}

  async onModuleInit(): Promise<void> {
    /* Conversiones a medias de un arranque anterior. */
    await mkdir(this.config.mediaCacheDir, { recursive: true }).catch(() => undefined);
    const names = await readdir(this.config.mediaCacheDir).catch(() => [] as string[]);
    await Promise.all(names.filter(n => n.endsWith('.part')).map(n => rm(join(this.config.mediaCacheDir, n), { force: true })));
    if (!(await this.hasFfmpeg())) {
      this.logger.warn('ffmpeg/ffprobe no están instalados: solo se reproducirán los videos que el navegador ya admite (MP4/H.264, WebM)');
    }
  }

  hasFfmpeg(): Promise<boolean> {
    this.available ??= Promise.all([this.runOk(this.config.ffmpegPath), this.runOk(this.config.ffprobePath)]).then(r => r.every(Boolean));
    return this.available;
  }

  private runOk(bin: string): Promise<boolean> {
    return new Promise(resolve => {
      const p = spawn(bin, ['-version'], { stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('exit', code => resolve(code === 0));
    });
  }

  /** Qué hacer con este video para este webview. Sin ffmpeg, se intenta directo. */
  async decide(file: MediaFile, caps: ClientCaps): Promise<PlaybackDecision> {
    if (!(await this.hasFfmpeg())) {
      return { plan: { mode: 'direct', video: 'copy', audio: 'copy', hevcTag: false, duration: null }, cacheKey: null, cached: false, ffmpeg: false };
    }
    const probe = await this.probe(file);
    const plan = planPlayback(probe, file.name, caps);
    if (plan.mode !== 'transcode' || this.config.mediaCacheBytes <= 0) return { plan, cacheKey: null, cached: false, ffmpeg: true };

    const cacheKey = createHash('sha256')
      .update(`${file.full}\0${file.size}\0${file.mtimeMs}\0${plan.video}:${plan.audio}\0${this.config.transcodeMaxHeight}`)
      .digest('hex')
      .slice(0, 40);
    const cached = await stat(this.cachePath(cacheKey)).then(s => s.isFile(), () => false);
    return { plan, cacheKey, cached, ffmpeg: true };
  }

  cachePath(key: string): string {
    return join(this.config.mediaCacheDir, `${key}.mp4`);
  }

  /** Marca de uso: la caché se vacía empezando por lo que hace más que no se ve. */
  async touchCache(key: string): Promise<void> {
    const now = new Date();
    await utimes(this.cachePath(key), now, now).catch(() => undefined);
  }

  private async probe(file: MediaFile): Promise<ProbeResult> {
    const key = `${file.full}\0${file.size}\0${file.mtimeMs}`;
    const hit = this.probes.get(key);
    if (hit) return hit;

    const out = await new Promise<string>((resolve, reject) => {
      const p = spawn(this.config.ffprobePath, [
        '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file.full,
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
      let data = '';
      const timer = setTimeout(() => p.kill('SIGKILL'), PROBE_TIMEOUT_MS);
      p.stdout.on('data', (c: Buffer) => { data += c.toString(); });
      p.on('error', reject);
      p.on('exit', code => { clearTimeout(timer); if (code === 0) resolve(data); else reject(new Error(`ffprobe salió con ${code}`)); });
    }).catch(err => {
      this.logger.warn(`ffprobe ${file.name}: ${(err as Error).message}`);
      return '{}';
    });

    let result: ProbeResult;
    try { result = JSON.parse(out) as ProbeResult; } catch { result = {}; }
    const oldest = this.probes.keys().next();
    if (this.probes.size >= PROBE_CACHE_MAX && !oldest.done) this.probes.delete(oldest.value);
    this.probes.set(key, result);
    return result;
  }

  /**
   * Envía el video como MP4 fragmentado desde `start` segundos. Una
   * conversión completa desde el principio se guarda en caché.
   */
  play(sessionId: string, file: MediaFile, decision: PlaybackDecision, start: number, res: Response): void {
    /* Al saltar, el reproductor pide desde otro punto: la conversión anterior sobra. */
    this.stop(sessionId);

    const heavy = decision.plan.mode === 'transcode';
    const busy = [...this.sessions.values()].filter(s => s.heavy).length;
    if (heavy && busy >= this.config.maxTranscodes) {
      throw new HttpException(
        { code: 'TRANSCODE_BUSY', message: 'La nube está convirtiendo otros videos ahora mismo.', hint: 'Espera un momento y vuelve a intentarlo.' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const args = ffmpegArgs(file.full, decision.plan, {
      start,
      threads: this.config.transcodeThreads,
      maxHeight: this.config.transcodeMaxHeight,
      preset: this.config.transcodePreset,
    });
    const proc = spawn(this.config.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    try { if (proc.pid) setPriority(proc.pid, LOW_PRIORITY); } catch { /* sin permiso: prioridad normal */ }
    const session: Session = { proc, heavy };
    this.sessions.set(sessionId, session);

    let stderr = '';
    proc.stderr?.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-2000); });

    /* Copia en caché solo de una conversión desde el principio. */
    const key = heavy && start === 0 && decision.cacheKey ? decision.cacheKey : null;
    const part = key ? `${this.cachePath(key)}.${process.pid}.${Date.now()}.part` : null;
    let cacheOut: WriteStream | null = part ? createWriteStream(part) : null;
    cacheOut?.on('error', () => { cacheOut = null; });

    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stdout = proc.stdout;
    stdout.on('data', (chunk: Buffer) => {
      cacheOut?.write(chunk);
      /* Contrapresión: si el reproductor no lee, ffmpeg espera (y no gasta CPU). */
      if (!res.write(chunk)) stdout.pause();
    });
    res.on('drain', () => stdout.resume());

    let closed = false;
    res.on('close', () => {
      closed = true;
      if (proc.exitCode === null) proc.kill('SIGKILL');
    });

    proc.on('error', err => {
      this.logger.error(`ffmpeg: ${err.message}`);
      res.destroy();
    });

    /* `close` y no `exit`: llega cuando ya se leyó toda la salida de ffmpeg. */
    proc.on('close', code => {
      if (this.sessions.get(sessionId) === session) this.sessions.delete(sessionId);
      const ok = code === 0 && !closed;
      if (!ok && code !== null && !closed) this.logger.warn(`ffmpeg ${file.name} salió con ${code}: ${stderr.trim().split('\n').pop() ?? ''}`);
      res.end();
      const out = cacheOut;
      cacheOut = null;
      if (!part || !key) return;
      if (!out) { void rm(part, { force: true }); return; }
      out.end(() => {
        if (ok) void this.finishCache(part, key);
        else void rm(part, { force: true });
      });
    });
  }

  /**
   * Desde dónde empieza de verdad la reproducción al saltar a `t`. Al
   * re-empaquetar (`-c copy`) solo se puede empezar en un fotograma clave:
   * se busca el anterior para que el reproductor muestre el tiempo exacto.
   * Al convertir, ffmpeg empieza justo en `t`.
   */
  async seekPoint(file: MediaFile, plan: PlaybackPlan, t: number): Promise<number> {
    if (plan.video !== 'copy' || t <= 0) return Math.max(0, t);
    const from = Math.max(0, t - 30);
    const out = await new Promise<string>(resolve => {
      const p = spawn(this.config.ffprobePath, [
        '-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey',
        '-read_intervals', `${from.toFixed(3)}%${(t + 0.05).toFixed(3)}`,
        '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'csv=p=0', file.full,
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
      let data = '';
      const timer = setTimeout(() => p.kill('SIGKILL'), PROBE_TIMEOUT_MS);
      p.stdout.on('data', (c: Buffer) => { data += c.toString(); });
      p.on('error', () => resolve(''));
      p.on('close', () => { clearTimeout(timer); resolve(data); });
    });
    const keys = out.split('\n').map(l => Number(l.trim().replace(/,$/, ''))).filter(n => Number.isFinite(n) && n <= t + 0.01);
    return keys.length ? Math.max(0, Math.max(...keys)) : t;
  }

  stop(sessionId: string): void {
    const prev = this.sessions.get(sessionId);
    if (!prev) return;
    this.sessions.delete(sessionId);
    if (prev.proc.exitCode === null) prev.proc.kill('SIGKILL');
  }

  /**
   * El MP4 fragmentado se rehace como MP4 normal con el índice al principio
   * (`-c copy`, segundos): así se puede servir a tramos y saltar sin ffmpeg.
   */
  private async finishCache(part: string, key: string): Promise<void> {
    const tmp = `${part}.faststart.part`;
    const ok = await new Promise<boolean>(resolve => {
      const p = spawn(this.config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', part, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', '-y', tmp], { stdio: 'ignore' });
      try { if (p.pid) setPriority(p.pid, LOW_PRIORITY); } catch { /* prioridad normal */ }
      p.on('error', () => resolve(false));
      p.on('exit', code => resolve(code === 0));
    });
    await rm(part, { force: true });
    if (!ok) { await rm(tmp, { force: true }); return; }
    await rename(tmp, this.cachePath(key));
    await this.trimCache();
  }

  /** Mantiene la caché bajo `CLOUD_MEDIA_CACHE_BYTES`, quitando lo menos visto. */
  private async trimCache(): Promise<void> {
    const dir = this.config.mediaCacheDir;
    const names = (await readdir(dir).catch(() => [] as string[])).filter(n => n.endsWith('.mp4'));
    const files = (await Promise.all(names.map(async n => {
      const s = await stat(join(dir, n)).catch(() => null);
      return s ? { path: join(dir, n), size: s.size, mtime: s.mtimeMs } : null;
    }))).filter((f): f is { path: string; size: number; mtime: number } => f !== null);
    let total = files.reduce((sum, f) => sum + f.size, 0);
    for (const f of files.sort((a, b) => a.mtime - b.mtime)) {
      if (total <= this.config.mediaCacheBytes) break;
      await rm(f.path, { force: true });
      total -= f.size;
    }
  }
}
