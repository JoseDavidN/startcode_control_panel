/* Explorador de Redis de la vista de una conexión (rutas `/databases/:id/redis/*`). */

export type RedisKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream';

export const REDIS_KEY_TYPES: RedisKeyType[] = ['string', 'hash', 'list', 'set', 'zset', 'stream'];

export const REDIS_TYPE_LABELS: Record<RedisKeyType, string> = {
  string: 'Texto',
  hash: 'Hash',
  list: 'Lista',
  set: 'Conjunto',
  zset: 'Conjunto ordenado',
  stream: 'Stream',
};

export interface RedisKeyspaceEntry { db: number; keys: number; expires: number }

export interface RedisOverview {
  version: string | null;
  mode: string | null;
  role: string | null;
  uptimeSeconds: number | null;
  usedMemory: number | null;
  /** 0: sin límite. */
  maxMemory: number | null;
  connectedClients: number | null;
  databases: number;
  keyspace: RedisKeyspaceEntry[];
}

export interface RedisKeyInfo {
  key: string;
  /** Uno de `RedisKeyType` o el de un módulo (ReJSON-RL…). */
  type: string;
  /** Milisegundos hasta caducar; -1 sin caducidad. */
  ttl: number;
}

export interface RedisScanResult {
  /** '0' cuando ya no hay más páginas. */
  cursor: string;
  keys: RedisKeyInfo[];
}

export type RedisValue =
  | { type: 'string'; value: string }
  | { type: 'hash'; value: { field: string; value: string }[] }
  | { type: 'list'; value: string[] }
  | { type: 'set'; value: string[] }
  | { type: 'zset'; value: { member: string; score: string }[] }
  | { type: 'stream'; value: { id: string; fields: [string, string][] }[] };

export type RedisKeyDetail = RedisKeyInfo & (RedisValue | { type: string; value: null }) & {
  /** Bytes del texto o elementos de la colección. */
  length: number;
  /** Se leyó solo una parte. */
  truncated: boolean;
  memory: number | null;
};

export type RedisReply = null | number | string | RedisReply[];

export interface RedisCommandResult {
  reply: RedisReply;
  truncated: boolean;
  durationMs: number;
}

export type RedisEditOp =
  | 'create' | 'set' | 'hset' | 'hdel' | 'lset' | 'lpush' | 'rpush' | 'lremIndex'
  | 'sadd' | 'srem' | 'zadd' | 'zrem' | 'xadd' | 'xdel' | 'expire' | 'rename';

export interface RedisEditInput {
  key: string;
  op: RedisEditOp;
  type?: RedisKeyType;
  value?: string;
  field?: string;
  member?: string;
  score?: number;
  index?: number;
  fields?: Record<string, string>;
  /** Segundos; null quita la caducidad. */
  ttl?: number | null;
  newKey?: string;
  id?: string;
}
