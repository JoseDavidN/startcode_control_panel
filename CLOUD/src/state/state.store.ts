import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import { hash } from 'bcryptjs';
import { CloudConfig } from '@/common/cloud-config';
import type { SectionPaths } from '@/common/sections';

export interface CloudUser {
  username: string;
  passwordHash: string;
  /** Rutas propias de Home y Backups; sin ellas, las por defecto. */
  paths?: SectionPaths;
  createdAt: string;
}

export interface CloudSession {
  /** Id del token (jti): revocarlo invalida el token aunque no haya expirado. */
  jti: string;
  username: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

interface StateFiles {
  users: CloudUser[];
  sessions: CloudSession[];
}

/** Coste de bcrypt, igual que BACKEND (OWASP). */
export const BCRYPT_ROUNDS = 12;

/* Usuarios válidos: letras, números, punto, guion y guion bajo. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/i;

/**
 * Estado interno de la nube en archivos JSON dentro de `CLOUD_DATA_DIR`
 * (`users.json` y `sessions.json`): no hay base de datos. Cada escritura va a
 * un temporal y se renombra, así un corte nunca deja un archivo a medias, y
 * las escrituras se encadenan para no pisarse entre peticiones.
 */
@Injectable()
export class StateStore implements OnModuleInit {
  private readonly logger = new Logger(StateStore.name);
  private state: StateFiles = { users: [], sessions: [] };
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly config: CloudConfig) {}

  async onModuleInit(): Promise<void> {
    await mkdir(this.config.dataDir, { recursive: true, mode: 0o700 });
    this.state = {
      users: await this.read<CloudUser[]>('users.json', []),
      sessions: await this.read<CloudSession[]>('sessions.json', []),
    };
    await this.purgeExpired();
    await this.seedAdmin();
  }

  /* ── Usuarios ── */

  findUser(username: string): CloudUser | undefined {
    const key = username.toLowerCase();
    return this.state.users.find(u => u.username.toLowerCase() === key);
  }

  async upsertUser(user: CloudUser): Promise<void> {
    const key = user.username.toLowerCase();
    this.state.users = [...this.state.users.filter(u => u.username.toLowerCase() !== key), user];
    await this.persist('users.json', this.state.users);
  }

  async setUserPaths(username: string, paths: SectionPaths): Promise<void> {
    const user = this.findUser(username);
    if (!user) return;
    await this.upsertUser({ ...user, paths });
  }

  /* ── Sesiones ── */

  findSession(jti: string): CloudSession | undefined {
    return this.state.sessions.find(s => s.jti === jti);
  }

  async addSession(session: CloudSession): Promise<void> {
    this.state.sessions = [...this.state.sessions, session];
    await this.persist('sessions.json', this.state.sessions);
  }

  async removeSession(jti: string): Promise<void> {
    this.state.sessions = this.state.sessions.filter(s => s.jti !== jti);
    await this.persist('sessions.json', this.state.sessions);
  }

  /** Última actividad; se guarda como mucho una vez por hora para no escribir en cada petición. */
  async touchSession(jti: string): Promise<void> {
    const session = this.findSession(jti);
    if (!session || Date.now() - Date.parse(session.lastSeenAt) < 3_600_000) return;
    session.lastSeenAt = new Date().toISOString();
    await this.persist('sessions.json', this.state.sessions);
  }

  /* ── Interno ── */

  private async purgeExpired(): Promise<void> {
    const now = Date.now();
    const alive = this.state.sessions.filter(s => Date.parse(s.expiresAt) > now);
    if (alive.length === this.state.sessions.length) return;
    this.state.sessions = alive;
    await this.persist('sessions.json', alive);
  }

  /** Primer usuario desde CLOUD_ADMIN_USERNAME / CLOUD_ADMIN_PASSWORD si aún no hay ninguno. */
  private async seedAdmin(): Promise<void> {
    if (this.state.users.length > 0) return;
    const { adminUsername, adminPassword } = this.config;
    if (!adminUsername || !adminPassword) {
      this.logger.warn('No hay usuarios. Define CLOUD_ADMIN_USERNAME y CLOUD_ADMIN_PASSWORD o crea uno con `pnpm user:add`.');
      return;
    }
    if (!USERNAME_RE.test(adminUsername) || adminPassword.length < 8) {
      this.logger.error('CLOUD_ADMIN_USERNAME no es válido o CLOUD_ADMIN_PASSWORD tiene menos de 8 caracteres: no se creó el usuario.');
      return;
    }
    await this.upsertUser({
      username: adminUsername,
      passwordHash: await hash(adminPassword, BCRYPT_ROUNDS),
      createdAt: new Date().toISOString(),
    });
    this.logger.log(`Usuario inicial «${adminUsername}» creado.`);
  }

  private async read<T>(file: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(join(this.config.dataDir, file), 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`No se pudo leer ${file} en ${this.config.dataDir}: ${(error as Error).message}`);
      }
      return fallback;
    }
  }

  private persist(file: string, data: unknown): Promise<void> {
    const target = join(this.config.dataDir, file);
    const run = async () => {
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      await rename(tmp, target);
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }
}
