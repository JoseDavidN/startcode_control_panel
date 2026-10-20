import { Injectable } from '@nestjs/common';
import { Client as PgClient } from 'pg';
import { createConnection as createMysqlConnection } from 'mysql2/promise';
import Redis from 'ioredis';
import { DatabaseEngine } from '../entities/database-connection.entity';
import type { ExplorerSession } from './explorer.common';
import { endpointOf, MYSQL_FLAGS } from './connection-factory';

/** Datos con los que se abre una conexión, con la contraseña ya descifrada. */
export interface ProbeTarget {
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  password: string | null;
  database: string | null;
  /** Con túnel SSH: lo abre (o reutiliza) y devuelve su boca local, a la que se conecta el driver. */
  tunnel?: () => Promise<{ host: string; port: number }>;
  /** Sesión abierta de la vista de consultas; sin ella, cada llamada conecta y cierra. */
  session?: ExplorerSession;
}

export interface ProbeResult {
  ok: boolean;
  version: string | null;
  error: string | null;
  latencyMs: number;
}

const TIMEOUT_MS = 5_000;

type Endpoint = { host: string; port: number };

/**
 * Abre una conexión real contra el motor, pide su versión y la cierra.
 * Es el único sitio donde se usa la contraseña en claro para conectar.
 */
@Injectable()
export class DatabaseProbeService {
  async probe(target: ProbeTarget): Promise<ProbeResult> {
    const started = Date.now();
    try {
      /* Con túnel, el intercambio SSH va antes: se le da su propio margen. */
      const version = await this.withTimeout(this.connect(target), target.tunnel ? 15_000 : 0);
      return { ok: true, version, error: null, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, version: null, error: describeError(err), latencyMs: Date.now() - started };
    }
  }

  private async connect(t: ProbeTarget): Promise<string | null> {
    const endpoint = await endpointOf(t);
    switch (t.engine) {
      case DatabaseEngine.POSTGRESQL: return this.postgres(t, endpoint);
      case DatabaseEngine.MYSQL:
      case DatabaseEngine.MARIADB: return this.mysql(t, endpoint);
      case DatabaseEngine.REDIS: return this.redis(t, endpoint);
    }
  }

  private async postgres(t: ProbeTarget, { host, port }: Endpoint): Promise<string | null> {
    const client = new PgClient({
      host,
      port,
      user: t.username,
      password: t.password ?? undefined,
      /* Sin base concreta se entra a `postgres`, que existe en toda instalación. */
      database: t.database || 'postgres',
      connectionTimeoutMillis: TIMEOUT_MS,
    });
    try {
      await client.connect();
      const res = await client.query<{ v: string }>("SELECT current_setting('server_version') AS v");
      return res.rows[0]?.v?.split(' ')[0] ?? null;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async mysql(t: ProbeTarget, { host, port }: Endpoint): Promise<string | null> {
    const conn = await createMysqlConnection({
      host,
      port,
      user: t.username,
      password: t.password ?? undefined,
      database: t.database || undefined,
      connectTimeout: TIMEOUT_MS,
      flags: MYSQL_FLAGS,
    });
    try {
      const [rows] = await conn.query('SELECT VERSION() AS v');
      const raw = (rows as { v?: string }[])[0]?.v ?? null;
      /* MariaDB responde `10.11.6-MariaDB-0ubuntu0.24.04.1`: basta el número. */
      return raw ? raw.split('-')[0] : null;
    } finally {
      await conn.end().catch(() => undefined);
    }
  }

  private async redis(t: ProbeTarget, { host, port }: Endpoint): Promise<string | null> {
    const client = new Redis({
      host,
      port,
      username: t.username || undefined,
      password: t.password || undefined,
      db: Number(t.database) || 0,
      lazyConnect: true,
      connectTimeout: TIMEOUT_MS,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    /* Sin este listener ioredis imprime cada fallo como "Unhandled error event". */
    client.on('error', () => undefined);
    try {
      await client.connect();
      const info = await client.info('server');
      return /redis_version:([^\r\n]+)/.exec(info)?.[1] ?? null;
    } finally {
      client.disconnect();
    }
  }

  private withTimeout<T>(promise: Promise<T>, extraMs: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), TIMEOUT_MS + 1_000 + extraMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}

/** Traduce los errores de los tres drivers a un mensaje para el usuario. */
function describeError(err: unknown): string {
  const e = err as { code?: string; errno?: number; message?: string };
  const code = e?.code ?? '';
  const msg = e?.message ?? String(err);

  /* Ya viene redactado (túnel SSH, huella sin confirmar o distinta). */
  if (code === 'ESSHTUNNEL' || code.startsWith('HOST_KEY_')) return msg;
  if (code === 'ECONNREFUSED') return 'Conexión rechazada: el motor no escucha en ese host y puerto';
  if (code === 'ETIMEDOUT' || /timeout/i.test(msg)) return 'Tiempo de espera agotado al conectar';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'No se encontró el host';
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'El host no es alcanzable desde el panel';
  /* PostgreSQL: 28P01 contraseña, 28000 usuario sin acceso; MySQL: ER_ACCESS_DENIED_ERROR;
     Redis: WRONGPASS / NOAUTH. */
  if (code === '28P01' || code === '28000' || code === 'ER_ACCESS_DENIED_ERROR' || /WRONGPASS|NOAUTH|invalid password/i.test(msg)) {
    return 'Usuario o contraseña incorrectos';
  }
  if (code === '3D000' || code === 'ER_BAD_DB_ERROR') return 'La base de datos no existe';
  if (/DB index is out of range/i.test(msg)) return 'El índice de base de Redis está fuera de rango';
  if (/Connection terminated unexpectedly|PROTOCOL_CONNECTION_LOST|Connection lost|ECONNRESET|Connection is closed/i.test(msg) || code === 'ECONNRESET') {
    return 'Se cortó la conexión con el motor. Con túnel SSH, comprueba que el motor escucha en ese host y puerto desde el servidor SSH';
  }
  return msg;
}
