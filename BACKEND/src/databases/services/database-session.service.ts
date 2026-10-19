import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Client } from 'pg';
import type { Connection } from 'mysql2/promise';
import type Redis from 'ioredis';
import { DatabaseEngine } from '../entities/database-connection.entity';
import type { ProbeTarget } from './database-probe.service';
import type { ExplorerSession } from './explorer.common';
import { openMysql, openPg, openRedis } from './connection-factory';
import { describeSqlError } from './database-explorer.service';
import { describePgError } from './postgres-explorer.service';
import { describeRedisError, redisDb, redisVersion } from './redis-explorer.service';

/** Sin uso durante este tiempo, la sesión se cierra sola (pestaña abandonada, app cerrada sin avisar). */
const IDLE_MS = 30 * 60_000;
const SWEEP_MS = 60_000;
/** Sesiones abiertas a la vez por usuario; al pasarse se cierra la más antigua. */
const MAX_SESSIONS_PER_USER = 5;

interface Session {
  id: string;
  userId: string;
  connectionId: string;
  target: ProbeTarget;
  lastUsed: number;
  /** Cola: las llamadas de una sesión van en serie (una conexión, una sentencia a la vez). */
  chain: Promise<unknown>;
  mysql: Connection | null;
  /** Base activa de la conexión MySQL (`USE`). */
  mysqlDb: string | null;
  pg: Map<string, Client>;
  redis: Redis | null;
  /** Base activa del cliente de Redis (`SELECT`). */
  redisDb: number | null;
}

/**
 * Conexiones de la vista de consultas. Se abre una al entrar a la vista y la
 * reutilizan el árbol y el editor; se cierra al salir (la app llama a
 * `DELETE`) o tras 30 minutos sin uso. Fuera de esa vista el panel no
 * mantiene conexiones abiertas ni comprueba nada por su cuenta.
 */
@Injectable()
export class DatabaseSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseSessionService.name);
  private readonly sessions = new Map<string, Session>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_MS);
    this.sweeper.unref();
  }

  async onModuleDestroy() {
    clearInterval(this.sweeper);
    await Promise.all([...this.sessions.values()].map(s => this.dispose(s)));
  }

  /** Abre la sesión conectando ya, y devuelve la versión del motor. */
  async open(userId: string, connectionId: string, target: ProbeTarget): Promise<{ sessionId: string; version: string | null }> {
    this.enforceLimit(userId);
    const session: Session = {
      id: randomUUID(),
      userId,
      connectionId,
      target: { ...target, session: undefined },
      lastUsed: Date.now(),
      chain: Promise.resolve(),
      mysql: null,
      mysqlDb: null,
      pg: new Map(),
      redis: null,
      redisDb: null,
    };
    const api = this.api(session);

    let version: string | null;
    try {
      if (target.engine === DatabaseEngine.REDIS) {
        version = await api.redis(redisDb(target.database), redisVersion);
      } else if (target.engine === DatabaseEngine.POSTGRESQL) {
        version = await api.pg(target.database || 'postgres', async c => {
          const res = await c.query<{ v: string }>("SELECT current_setting('server_version') AS v");
          return res.rows[0]?.v?.split(' ')[0] ?? null;
        });
      } else {
        version = await api.mysql(target.database, async c => {
          const [rows] = await c.query('SELECT VERSION() AS v');
          const raw = (rows as { v?: string }[])[0]?.v ?? null;
          return raw ? raw.split('-')[0] : null;
        });
      }
    } catch (err) {
      await this.dispose(session);
      throw err instanceof BadRequestException ? err : new BadRequestException(this.describe(target, err));
    }

    this.sessions.set(session.id, session);
    return { sessionId: session.id, version };
  }

  /** Destino con la sesión enganchada; falla si se cerró o no es de este usuario y conexión. */
  get(userId: string, connectionId: string, sessionId: string): ProbeTarget {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.connectionId !== connectionId) {
      throw new BadRequestException({
        code: 'DB_SESSION_CLOSED',
        message: 'La conexión de esta vista se cerró. Vuelve a conectar para seguir.',
      });
    }
    session.lastUsed = Date.now();
    return { ...session.target, session: this.api(session) };
  }

  async close(userId: string, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) return;
    await this.dispose(session);
  }

  /** Cierra las sesiones de una conexión (al editarla o borrarla). */
  async closeForConnection(connectionId: string): Promise<void> {
    await Promise.all([...this.sessions.values()].filter(s => s.connectionId === connectionId).map(s => this.dispose(s)));
  }

  private api(session: Session): ExplorerSession {
    const serial = <T>(fn: () => Promise<T>): Promise<T> => {
      const run = session.chain.then(fn, fn);
      session.chain = run.catch(() => undefined);
      return run;
    };

    return {
      mysql: <T>(database: string | null, fn: (conn: Connection) => Promise<T>) => serial(async () => {
        const conn = await this.ensureMysql(session);
        if (database && database !== session.mysqlDb) {
          await conn.query(`USE ${conn.escapeId(database)}`);
          session.mysqlDb = database;
        }
        try {
          return await fn(conn);
        } catch (err) {
          /* Conexión rota (servidor reiniciado, red): la próxima llamada reconecta. */
          if ((err as { fatal?: boolean }).fatal) this.dropMysql(session);
          throw err;
        }
      }),
      pg: <T>(database: string, fn: (client: Client) => Promise<T>) => serial(async () => {
        let client = session.pg.get(database);
        if (!client) {
          try {
            client = await openPg(session.target, database);
          } catch (err) {
            throw new BadRequestException(describePgError(err));
          }
          const opened = client;
          opened.on('error', () => session.pg.delete(database));
          opened.on('end', () => { if (session.pg.get(database) === opened) session.pg.delete(database); });
          session.pg.set(database, opened);
        }
        return fn(client);
      }),
      redis: <T>(db: number, fn: (client: Redis) => Promise<T>) => serial(async () => {
        const client = await this.ensureRedis(session, db);
        if (db !== session.redisDb) {
          await client.select(db);
          session.redisDb = db;
        }
        return fn(client);
      }),
    };
  }

  private async ensureRedis(session: Session, db: number): Promise<Redis> {
    if (session.redis && session.redis.status === 'ready') return session.redis;
    this.dropRedis(session);
    try {
      const client = await openRedis(session.target, db);
      /* Corte de red o servidor reiniciado: la próxima llamada reconecta. */
      client.on('end', () => { if (session.redis === client) { session.redis = null; session.redisDb = null; } });
      session.redis = client;
      session.redisDb = db;
      return client;
    } catch (err) {
      throw new BadRequestException(describeRedisError(err));
    }
  }

  private dropRedis(session: Session) {
    session.redis?.disconnect();
    session.redis = null;
    session.redisDb = null;
  }

  private async ensureMysql(session: Session): Promise<Connection> {
    if (session.mysql) return session.mysql;
    try {
      const conn = await openMysql(session.target, session.target.database);
      conn.on('error', () => this.dropMysql(session));
      session.mysql = conn;
      session.mysqlDb = session.target.database;
      return conn;
    } catch (err) {
      throw new BadRequestException(describeSqlError(err));
    }
  }

  private dropMysql(session: Session) {
    session.mysql?.destroy();
    session.mysql = null;
    session.mysqlDb = null;
  }

  private async dispose(session: Session) {
    this.sessions.delete(session.id);
    await session.mysql?.end().catch(() => session.mysql?.destroy());
    session.mysql = null;
    await Promise.all([...session.pg.values()].map(c => c.end().catch(() => undefined)));
    session.pg.clear();
    if (session.redis) await session.redis.quit().catch(() => session.redis?.disconnect());
    session.redis = null;
  }

  private enforceLimit(userId: string) {
    const own = [...this.sessions.values()].filter(s => s.userId === userId).sort((a, b) => a.lastUsed - b.lastUsed);
    for (const s of own.slice(0, Math.max(0, own.length - MAX_SESSIONS_PER_USER + 1))) void this.dispose(s);
  }

  private sweep() {
    const now = Date.now();
    for (const s of this.sessions.values()) {
      if (now - s.lastUsed > IDLE_MS) {
        this.logger.debug(`Sesión de consultas ${s.id} cerrada por inactividad`);
        void this.dispose(s);
      }
    }
  }

  private describe(target: ProbeTarget, err: unknown): string {
    if (target.engine === DatabaseEngine.REDIS) return describeRedisError(err);
    return target.engine === DatabaseEngine.POSTGRESQL ? describePgError(err) : describeSqlError(err);
  }
}
