import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ProbeTarget } from './database-probe.service';
import { openRedis } from './connection-factory';
import { checkCommand, tokenizeCommand } from './redis-policy';

/* ── Límites de lo que viaja a la app ── */
/** Elementos que se leen de un hash, lista, conjunto o conjunto ordenado. */
export const REDIS_MAX_ITEMS = 500;
/** Entradas de un stream (las más recientes). */
export const REDIS_MAX_STREAM = 200;
/** Bytes de un valor de texto. */
export const REDIS_MAX_STRING = 256 * 1024;
/** Claves por página del buscador. */
export const REDIS_SCAN_PAGE = 100;
/** Elementos y bytes de la respuesta de la consola. */
const REPLY_MAX_ITEMS = 5_000;
const REPLY_MAX_BYTES = 2 * 1024 * 1024;
/** Bases que ofrece el selector (las de la configuración por defecto). */
const MAX_DATABASES = 16;

export interface RedisKeyspaceEntry { db: number; keys: number; expires: number }

export interface RedisOverview {
  version: string | null;
  /** standalone, cluster o sentinel. */
  mode: string | null;
  /** master o slave (réplica). */
  role: string | null;
  uptimeSeconds: number | null;
  usedMemory: number | null;
  /** 0: sin límite. */
  maxMemory: number | null;
  connectedClients: number | null;
  /** Bases disponibles (CONFIG GET databases, hasta 16). */
  databases: number;
  keyspace: RedisKeyspaceEntry[];
}

export interface RedisKeyInfo {
  key: string;
  type: string;
  /** Milisegundos hasta caducar; -1 sin caducidad. */
  ttl: number;
}

export interface RedisScanResult {
  /** Cursor para la página siguiente; '0' cuando ya no hay más. */
  cursor: string;
  keys: RedisKeyInfo[];
}

export type RedisValue =
  | { type: 'string'; value: string }
  | { type: 'hash'; value: { field: string; value: string }[] }
  | { type: 'list'; value: string[] }
  | { type: 'set'; value: string[] }
  | { type: 'zset'; value: { member: string; score: string }[] }
  | { type: 'stream'; value: { id: string; fields: [string, string][] }[] }
  | { type: string; value: null };

export type RedisKeyDetail = RedisKeyInfo & RedisValue & {
  /** Bytes del texto o elementos de la colección. */
  length: number;
  /** Se leyó solo una parte (ver los límites `REDIS_MAX_*`). */
  truncated: boolean;
  /** Bytes que ocupa en memoria (MEMORY USAGE), si el servidor lo da. */
  memory: number | null;
};

export type RedisReply = null | number | string | RedisReply[];

export interface RedisCommandResult {
  reply: RedisReply;
  /** La respuesta superaba el tope y se recortó. */
  truncated: boolean;
  durationMs: number;
}

/** Cambios desde el explorador. Cada `op` usa sus campos; el servicio los valida. */
export interface RedisEditInput {
  key: string;
  op:
    | 'create' | 'set' | 'hset' | 'hdel' | 'lset' | 'lpush' | 'rpush' | 'lremIndex'
    | 'sadd' | 'srem' | 'zadd' | 'zrem' | 'xadd' | 'xdel' | 'expire' | 'rename';
  /** En `create`: tipo de la clave nueva. */
  type?: string;
  value?: string;
  field?: string;
  member?: string;
  score?: number;
  index?: number;
  /** Campos de una entrada de stream. */
  fields?: Record<string, string>;
  /** Segundos; null quita la caducidad. En `create`, opcional. */
  ttl?: number | null;
  /** En `rename`. */
  newKey?: string;
  /** Id de una entrada de stream (`xdel`). */
  id?: string;
}

/** Índice de base guardado en la conexión (texto) como número. */
export function redisDb(database: string | null): number {
  const n = Number(database ?? 0);
  return Number.isInteger(n) && n >= 0 && n < MAX_DATABASES ? n : 0;
}

export async function redisVersion(client: Redis): Promise<string | null> {
  return parseInfo(await client.info('server')).redis_version ?? null;
}

/** Errores de ioredis y de Redis en un mensaje para el usuario. */
export function describeRedisError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? '';
  const msg = e?.message ?? String(err);
  if (code === 'ECONNREFUSED') return 'Conexión rechazada: Redis no escucha en ese host y puerto';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'No se encontró el host';
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'El host no es alcanzable desde el panel';
  if (/Command timed out/i.test(msg)) return 'El comando tardó demasiado y se canceló';
  if (code === 'ETIMEDOUT' || /connect ETIMEDOUT|timeout/i.test(msg)) return 'Tiempo de espera agotado al conectar';
  if (/WRONGPASS|invalid password|invalid username-password/i.test(msg)) return 'Usuario o contraseña incorrectos';
  if (/^NOAUTH/i.test(msg)) return 'Redis pide contraseña y la conexión no tiene';
  if (/^NOPERM/i.test(msg)) return `El usuario no tiene permiso: ${msg.replace(/^NOPERM\s*/i, '')}`;
  if (/^WRONGTYPE/i.test(msg)) return 'La clave es de otro tipo';
  if (/^READONLY/i.test(msg)) return 'El servidor es una réplica de solo lectura';
  if (/^OOM/i.test(msg)) return 'Redis no tiene memoria para escribir (maxmemory)';
  if (/DB index is out of range/i.test(msg)) return 'El índice de base de Redis está fuera de rango';
  if (/Connection is closed|Stream isn't writeable/i.test(msg)) return 'La conexión con Redis se cerró';
  return msg;
}

/** `clave:valor` de INFO (sin secciones ni comentarios). */
function parseInfo(info: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of info.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0 && !line.startsWith('#')) out[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return out;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* La consola devuelve la respuesta tal cual, con un tope de elementos y bytes. */
function toReply(raw: unknown): { reply: RedisReply; truncated: boolean } {
  let items = 0;
  let bytes = 0;
  let truncated = false;
  const walk = (v: unknown): RedisReply => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (Buffer.isBuffer(v)) v = v.toString('utf8');
    if (v instanceof Error) return `(error) ${v.message}`;
    if (Array.isArray(v)) {
      const out: RedisReply[] = [];
      for (const item of v) {
        if (items >= REPLY_MAX_ITEMS || bytes >= REPLY_MAX_BYTES) { truncated = true; break; }
        items++;
        out.push(walk(item));
      }
      return out;
    }
    const text = typeof v === 'string' ? v : JSON.stringify(v);
    if (bytes + text.length > REPLY_MAX_BYTES) {
      truncated = true;
      const room = Math.max(0, REPLY_MAX_BYTES - bytes);
      bytes = REPLY_MAX_BYTES;
      return text.slice(0, room);
    }
    bytes += text.length;
    return text;
  };
  return { reply: walk(raw), truncated };
}

/* Pares [a, b, a, b…] de HGETALL, ZRANGE WITHSCORES, XRANGE… */
function pairs(list: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < list.length; i += 2) out.push([list[i], list[i + 1]]);
  return out;
}

const requireText = (v: string | undefined, what: string): string => {
  if (v === undefined) throw new BadRequestException(`Falta ${what}`);
  return v;
};

/**
 * Explorador de Redis de la vista de consultas: resumen del servidor, claves
 * por base (SCAN, nunca KEYS), valor de cada tipo, cambios y la consola de
 * comandos. Con sesión usa su cliente; sin ella abre uno para la llamada.
 */
@Injectable()
export class RedisExplorerService {
  private async run<T>(t: ProbeTarget, db: number, fn: (client: Redis) => Promise<T>): Promise<T> {
    try {
      if (t.session) return await t.session.redis(db, fn);
      const client = await openRedis(t, db);
      try {
        return await fn(client);
      } finally {
        await client.quit().catch(() => client.disconnect());
      }
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ConflictException || err instanceof NotFoundException) throw err;
      throw new BadRequestException(describeRedisError(err));
    }
  }

  async overview(t: ProbeTarget): Promise<RedisOverview> {
    return this.run(t, redisDb(t.database), async c => {
      const info = parseInfo(await c.info());
      /* CONFIG puede estar prohibido (ACL, servicios gestionados): se asumen 16. */
      let databases = MAX_DATABASES;
      try {
        const res = (await c.call('CONFIG', 'GET', 'databases')) as string[];
        databases = Math.min(MAX_DATABASES, Math.max(1, Number(res?.[1]) || MAX_DATABASES));
      } catch { /* sin permiso */ }
      const keyspace: RedisKeyspaceEntry[] = [];
      for (const [name, value] of Object.entries(info)) {
        const m = /^db(\d+)$/.exec(name);
        if (!m) continue;
        const fields = Object.fromEntries(value.split(',').map(p => p.split('=') as [string, string]));
        keyspace.push({ db: Number(m[1]), keys: Number(fields.keys) || 0, expires: Number(fields.expires) || 0 });
      }
      keyspace.sort((a, b) => a.db - b.db);
      return {
        version: info.redis_version ?? null,
        mode: info.redis_mode ?? null,
        role: info.role ?? null,
        uptimeSeconds: num(info.uptime_in_seconds),
        usedMemory: num(info.used_memory),
        maxMemory: num(info.maxmemory),
        connectedClients: num(info.connected_clients),
        databases,
        keyspace,
      };
    });
  }

  /**
   * Una página de claves. SCAN puede devolver pocas o ninguna por vuelta con
   * un patrón que casi no coincide: se dan varias vueltas hasta llenar la
   * página, con un tope para no recorrer una base enorme de una vez.
   */
  async scan(t: ProbeTarget, db: number, pattern: string, cursor: string, type?: string): Promise<RedisScanResult> {
    return this.run(t, db, async c => {
      const keys: string[] = [];
      let next = cursor || '0';
      for (let round = 0; round < 50 && keys.length < REDIS_SCAN_PAGE; round++) {
        const args: (string | number)[] = [next, 'MATCH', pattern || '*', 'COUNT', 500];
        if (type) args.push('TYPE', type);
        const [nextCursor, batch] = (await c.call('SCAN', ...args)) as [string, string[]];
        keys.push(...batch);
        next = nextCursor;
        if (next === '0') break;
      }
      const unique = [...new Set(keys)];
      const pipe = c.pipeline();
      for (const k of unique) pipe.type(k).pttl(k);
      const res = (await pipe.exec()) ?? [];
      return {
        cursor: next,
        keys: unique
          .map((key, i) => ({ key, type: (res[i * 2]?.[1] as string | undefined) ?? 'none', ttl: Number(res[i * 2 + 1]?.[1] ?? -1) }))
          /* Caducó o se borró entre SCAN y TYPE. */
          .filter(k => k.type !== 'none'),
      };
    });
  }

  async getKey(t: ProbeTarget, db: number, key: string): Promise<RedisKeyDetail> {
    return this.run(t, db, async c => {
      const type = await c.type(key);
      if (type === 'none') throw new NotFoundException('La clave no existe (pudo caducar o borrarse)');
      const ttl = await c.pttl(key);
      let memory: number | null = null;
      try { memory = Number(await c.call('MEMORY', 'USAGE', key)) || null; } catch { /* sin permiso o Redis antiguo */ }
      const base = { key, ttl, memory };

      switch (type) {
        case 'string': {
          const length = await c.strlen(key);
          const value = length > REDIS_MAX_STRING ? await c.getrange(key, 0, REDIS_MAX_STRING - 1) : (await c.get(key)) ?? '';
          return { ...base, type, value, length, truncated: length > REDIS_MAX_STRING };
        }
        case 'hash': {
          const length = await c.hlen(key);
          let entries: [string, string][];
          if (length <= REDIS_MAX_ITEMS) {
            entries = Object.entries(await c.hgetall(key));
          } else {
            entries = [];
            let cur = '0';
            do {
              const [nextCur, batch] = await c.hscan(key, cur, 'COUNT', 200);
              entries.push(...pairs(batch));
              cur = nextCur;
            } while (cur !== '0' && entries.length < REDIS_MAX_ITEMS);
            entries = entries.slice(0, REDIS_MAX_ITEMS);
          }
          entries.sort((a, b) => a[0].localeCompare(b[0]));
          return { ...base, type, value: entries.map(([field, value]) => ({ field, value })), length, truncated: length > entries.length };
        }
        case 'list': {
          const length = await c.llen(key);
          const value = await c.lrange(key, 0, REDIS_MAX_ITEMS - 1);
          return { ...base, type, value, length, truncated: length > value.length };
        }
        case 'set': {
          const length = await c.scard(key);
          let value: string[];
          if (length <= REDIS_MAX_ITEMS) {
            value = await c.smembers(key);
          } else {
            value = [];
            let cur = '0';
            do {
              const [nextCur, batch] = await c.sscan(key, cur, 'COUNT', 200);
              value.push(...batch);
              cur = nextCur;
            } while (cur !== '0' && value.length < REDIS_MAX_ITEMS);
            value = [...new Set(value)].slice(0, REDIS_MAX_ITEMS);
          }
          value.sort((a, b) => a.localeCompare(b));
          return { ...base, type, value, length, truncated: length > value.length };
        }
        case 'zset': {
          const length = await c.zcard(key);
          const raw = await c.zrange(key, 0, REDIS_MAX_ITEMS - 1, 'WITHSCORES');
          const value = pairs(raw).map(([member, score]) => ({ member, score }));
          return { ...base, type, value, length, truncated: length > value.length };
        }
        case 'stream': {
          const length = await c.xlen(key);
          const raw = await c.xrevrange(key, '+', '-', 'COUNT', REDIS_MAX_STREAM);
          const value = raw.map(([id, fields]) => ({ id, fields: pairs(fields) }));
          return { ...base, type, value, length, truncated: length > value.length };
        }
        default:
          /* Tipos de módulos (ReJSON-RL, TSDB-TYPE…): se ven en la lista, el valor por la consola. */
          return { ...base, type, value: null, length: 0, truncated: false };
      }
    });
  }

  async edit(t: ProbeTarget, db: number, input: RedisEditInput): Promise<{ ok: true }> {
    const { key } = input;
    return this.run(t, db, async c => {
      const mustExist = async () => {
        if (!(await c.exists(key))) throw new NotFoundException('La clave no existe (pudo caducar o borrarse)');
      };
      switch (input.op) {
        case 'create':
          await this.create(c, input);
          break;
        case 'set': {
          await mustExist();
          /* Reemplazar el texto conserva la caducidad (SET la quitaría). */
          const pttl = await c.pttl(key);
          const tx = c.multi().set(key, requireText(input.value, 'el valor'));
          if (pttl > 0) tx.pexpire(key, pttl);
          await this.exec(tx);
          break;
        }
        case 'hset':
          await mustExist();
          await c.hset(key, requireText(input.field, 'el campo'), requireText(input.value, 'el valor'));
          break;
        case 'hdel':
          await c.hdel(key, requireText(input.field, 'el campo'));
          break;
        case 'lset':
          if (input.index === undefined) throw new BadRequestException('Falta la posición');
          await c.lset(key, input.index, requireText(input.value, 'el valor'));
          break;
        case 'lpush':
        case 'rpush':
          await mustExist();
          if (input.op === 'lpush') await c.lpush(key, requireText(input.value, 'el valor'));
          else await c.rpush(key, requireText(input.value, 'el valor'));
          break;
        case 'lremIndex': {
          if (input.index === undefined) throw new BadRequestException('Falta la posición');
          /* Redis no borra por posición: se marca con un valor único y se borra ese, en un solo paso. */
          const removed = await c.eval(
            "local v = redis.call('LINDEX', KEYS[1], ARGV[1]) if not v then return 0 end redis.call('LSET', KEYS[1], ARGV[1], ARGV[2]) return redis.call('LREM', KEYS[1], 1, ARGV[2])",
            1, key, input.index, `__startcode_delete_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          );
          if (!removed) throw new NotFoundException('Esa posición ya no existe en la lista');
          break;
        }
        case 'sadd':
          await mustExist();
          await c.sadd(key, requireText(input.member, 'el miembro'));
          break;
        case 'srem':
          await c.srem(key, requireText(input.member, 'el miembro'));
          break;
        case 'zadd':
          await mustExist();
          if (input.score === undefined || !Number.isFinite(input.score)) throw new BadRequestException('La puntuación debe ser un número');
          await c.zadd(key, input.score, requireText(input.member, 'el miembro'));
          break;
        case 'zrem':
          await c.zrem(key, requireText(input.member, 'el miembro'));
          break;
        case 'xadd':
          await mustExist();
          await c.xadd(key, '*', ...this.streamFields(input.fields));
          break;
        case 'xdel':
          await c.xdel(key, requireText(input.id, 'el id de la entrada'));
          break;
        case 'expire':
          await mustExist();
          if (input.ttl === null || input.ttl === undefined) await c.persist(key);
          else if (!Number.isInteger(input.ttl) || input.ttl <= 0) throw new BadRequestException('La caducidad debe ser un número entero de segundos mayor que 0');
          else await c.expire(key, input.ttl);
          break;
        case 'rename': {
          const target = requireText(input.newKey, 'el nombre nuevo');
          if (!target) throw new BadRequestException('El nombre nuevo está vacío');
          if (target === key) break;
          await mustExist();
          if (!(await c.renamenx(key, target))) throw new ConflictException('Ya existe una clave con ese nombre');
          break;
        }
      }
      return { ok: true as const };
    });
  }

  /** Borra claves (UNLINK: libera la memoria sin bloquear; DEL en Redis antiguos). */
  async deleteKeys(t: ProbeTarget, db: number, keys: string[]): Promise<{ deleted: number }> {
    return this.run(t, db, async c => {
      try {
        return { deleted: Number(await c.call('UNLINK', ...keys)) };
      } catch (err) {
        if (!/unknown command/i.test((err as Error).message)) throw err;
        return { deleted: await c.del(...keys) };
      }
    });
  }

  /** Una línea de la consola. Lo que no se admite se rechaza aquí; lo peligroso lo confirma el llamador. */
  async command(t: ProbeTarget, db: number, args: string[]): Promise<RedisCommandResult> {
    const check = checkCommand(args);
    if (check.kind === 'blocked') {
      throw new BadRequestException({
        code: 'REDIS_COMMAND_BLOCKED',
        message: `${args[0].toUpperCase()} no se puede usar en la consola: ${check.reason}.`,
      });
    }
    return this.run(t, db, async c => {
      const started = Date.now();
      try {
        const raw = await c.call(args[0], ...args.slice(1));
        return { ...toReply(raw), durationMs: Date.now() - started };
      } catch (err) {
        /* La respuesta de error de Redis tal cual (ERR wrong number of arguments…), como en redis-cli. */
        if ((err as Error).name === 'ReplyError') throw new BadRequestException((err as Error).message);
        throw err;
      }
    });
  }

  /** Parte la línea; las comillas sin cerrar son un error de escritura. */
  parseCommand(line: string): string[] {
    let args: string[];
    try {
      args = tokenizeCommand(line);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (!args.length) throw new BadRequestException('El comando está vacío');
    return args;
  }

  private async create(c: Redis, input: RedisEditInput): Promise<void> {
    const { key } = input;
    if (!key) throw new BadRequestException('El nombre de la clave está vacío');
    if (await c.exists(key)) throw new ConflictException('Ya existe una clave con ese nombre');
    if (input.ttl !== undefined && input.ttl !== null && (!Number.isInteger(input.ttl) || input.ttl <= 0)) {
      throw new BadRequestException('La caducidad debe ser un número entero de segundos mayor que 0');
    }
    const tx = c.multi();
    switch (input.type) {
      case 'string': tx.set(key, requireText(input.value, 'el valor')); break;
      case 'hash': tx.hset(key, requireText(input.field, 'el campo'), requireText(input.value, 'el valor')); break;
      case 'list': tx.rpush(key, requireText(input.value, 'el valor')); break;
      case 'set': tx.sadd(key, requireText(input.member, 'el miembro')); break;
      case 'zset':
        if (input.score === undefined || !Number.isFinite(input.score)) throw new BadRequestException('La puntuación debe ser un número');
        tx.zadd(key, input.score, requireText(input.member, 'el miembro'));
        break;
      case 'stream': tx.xadd(key, '*', ...this.streamFields(input.fields)); break;
      default: throw new BadRequestException('Tipo de clave no válido');
    }
    if (input.ttl) tx.expire(key, input.ttl);
    await this.exec(tx);
  }

  private streamFields(fields: Record<string, string> | undefined): string[] {
    const list = Object.entries(fields ?? {}).filter(([f]) => f);
    if (!list.length) throw new BadRequestException('La entrada necesita al menos un campo');
    return list.flat();
  }

  /* `exec` no lanza: devuelve el error de cada comando. Se relanza el primero. */
  private async exec(tx: ReturnType<Redis['multi']>): Promise<void> {
    const res = await tx.exec();
    const failed = res?.find(([err]) => err)?.[0];
    if (failed) throw failed;
  }
}
