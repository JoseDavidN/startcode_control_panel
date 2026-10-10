import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  }
}
