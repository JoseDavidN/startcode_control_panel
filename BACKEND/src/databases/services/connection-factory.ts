import { Client, types as pgTypes } from 'pg';
import { createConnection, type Connection } from 'mysql2/promise';
import type { ProbeTarget } from './database-probe.service';
import { CONNECT_TIMEOUT_MS, QUERY_TIMEOUT_MS } from './explorer.common';

/*
 * Cómo se abre una conexión de gestión a cada motor. Lo usan los
 * exploradores (conexión de una sola llamada) y las sesiones de la vista de
 * consultas (conexión que vive mientras el usuario está en ella).
 */

export function openMysql(t: ProbeTarget, database: string | null): Promise<Connection> {
  return createConnection({
    host: t.host,
    port: t.port,
    user: t.username,
    password: t.password ?? undefined,
    database: database || undefined,
    connectTimeout: CONNECT_TIMEOUT_MS,
    /* Fechas y enteros grandes como texto: tal cual los guarda el motor,
       sin husos ni pérdida de precisión al pasar por JSON. */
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
  });
}

/* PostgreSQL: fechas, horas e intervalos como texto, tal cual los devuelve el
   motor (el driver los convertiría a Date en el huso del panel). int8 y
   numeric ya llegan como texto por defecto y conservan todos sus dígitos. */
const RAW_TEXT_OIDS = new Set([1082, 1083, 1114, 1184, 1186, 1266]);
type TypeParser = (value: string) => unknown;
const defaultParser = pgTypes.getTypeParser as (oid: number, format?: 'text' | 'binary') => TypeParser;
const typeParsers = {
  getTypeParser: (oid: number, format?: 'text' | 'binary'): TypeParser =>
    RAW_TEXT_OIDS.has(oid) ? (v: string) => v : defaultParser(oid, format),
};

/** Cliente conectado; si falla al conectar, lo cierra y relanza el error. */
export async function openPg(t: ProbeTarget, database: string): Promise<Client> {
  const client = new Client({
    host: t.host,
    port: t.port,
    user: t.username,
    password: t.password ?? undefined,
    database,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    /* El servidor corta la sentencia; el cliente, por si el servidor no responde. */
    statement_timeout: QUERY_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS + 2_000,
    types: typeParsers,
  });
  /* Sin este listener, un corte de red tras conectar tumba el proceso. */
  client.on('error', () => undefined);
  try {
    await client.connect();
    return client;
  } catch (err) {
    await client.end().catch(() => undefined);
    throw err;
  }
}
