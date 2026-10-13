import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cpus } from 'os';
import { resolve } from 'path';
import type { SectionPaths } from './sections';

/** Bytes de un tamaño escrito como `10gb`, `500mb` o un número. */
export function parseBytes(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?\s*$/i.exec(raw);
  if (!m) return fallback;
  const unit = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 }[(m[2] ?? 'b').toLowerCase() as 'b'];
  return Math.floor(Number(m[1]) * unit);
}

/**
 * Configuración de la nube leída del entorno, con valores por defecto
 * pensados para desarrollo. Se lee una vez y queda tipada.
 */
@Injectable()
export class CloudConfig {
  readonly dataDir: string;
  /** Carpetas dentro de las que pueden vivir Home y Backups. */
  readonly allowedRoots: string[];
  readonly defaultPaths: SectionPaths;
  readonly jwtSecret: string;
  readonly tokenTtl: string;
  readonly maxUploadBytes: number;
  readonly treeMaxEntries: number;
  readonly adminUsername?: string;
  readonly adminPassword?: string;
  /* Video: ffmpeg/ffprobe para reproducir cualquier formato. */
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  /** Conversiones a H.264 a la vez (las más pesadas); el resto espera. */
  readonly maxTranscodes: number;
  readonly transcodeThreads: number;
  readonly transcodeMaxHeight: number;
  readonly transcodePreset: string;
  /** Videos ya convertidos: la segunda vez se sirven sin ffmpeg. 0 lo desactiva. */
  readonly mediaCacheBytes: number;
  readonly mediaCacheDir: string;

  constructor(config: ConfigService) {
    const get = (key: string) => config.get<string>(key)?.trim() || undefined;
    this.dataDir = resolve(get('CLOUD_DATA_DIR') ?? './data');
    this.allowedRoots = (get('CLOUD_ALLOWED_ROOTS') ?? './storage')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => resolve(p));
    this.defaultPaths = {
      home: resolve(get('CLOUD_DEFAULT_HOME') ?? `${this.allowedRoots[0]}/home`),
      backups: resolve(get('CLOUD_DEFAULT_BACKUPS') ?? `${this.allowedRoots[0]}/backups`),
    };
    const secret = get('CLOUD_JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error('CLOUD_JWT_SECRET no está definido o tiene menos de 32 caracteres. Defínelo en .env antes de arrancar.');
    }
    this.jwtSecret = secret;
    this.tokenTtl = get('CLOUD_TOKEN_TTL') ?? '180d';
    this.maxUploadBytes = parseBytes(get('CLOUD_MAX_UPLOAD_BYTES'), 20 * 1024 ** 3);
    this.treeMaxEntries = Number(get('CLOUD_TREE_MAX_ENTRIES') ?? 50_000) || 50_000;
    this.adminUsername = get('CLOUD_ADMIN_USERNAME');
    this.adminPassword = get('CLOUD_ADMIN_PASSWORD');
    this.ffmpegPath = get('CLOUD_FFMPEG_PATH') ?? 'ffmpeg';
    this.ffprobePath = get('CLOUD_FFPROBE_PATH') ?? 'ffprobe';
    this.maxTranscodes = Math.max(1, Number(get('CLOUD_MAX_TRANSCODES') ?? 2) || 2);
    /* Por defecto la mitad de los núcleos (mínimo 2): deja aire al resto del servidor. */
    this.transcodeThreads = Math.max(1, Number(get('CLOUD_TRANSCODE_THREADS')) || Math.max(2, Math.floor(cpus().length / 2)));
    /* 720p con `superfast` va por encima de tiempo real incluso con 2 núcleos. */
    this.transcodeMaxHeight = Math.max(240, Number(get('CLOUD_TRANSCODE_MAX_HEIGHT') ?? 720) || 720);
    const preset = get('CLOUD_TRANSCODE_PRESET') ?? 'superfast';
    this.transcodePreset = /^(ultrafast|superfast|veryfast|faster|fast|medium)$/.test(preset) ? preset : 'superfast';
    this.mediaCacheBytes = parseBytes(get('CLOUD_MEDIA_CACHE_BYTES'), 10 * 1024 ** 3);
    this.mediaCacheDir = resolve(get('CLOUD_MEDIA_CACHE_DIR') ?? `${this.dataDir}/media-cache`);
  }
}
