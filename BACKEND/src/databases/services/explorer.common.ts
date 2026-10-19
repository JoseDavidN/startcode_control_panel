/* Tipos y utilidades comunes a los exploradores de MySQL/MariaDB y PostgreSQL. */
import { BadRequestException } from '@nestjs/common';


import type { Client as PgClient } from 'pg';
import type { Connection as MysqlConnection } from 'mysql2/promise';
import type Redis from 'ioredis';

/**
 * Conexión abierta de la vista de consultas (`DatabaseSessionService`). Si el
 * destino trae una, los exploradores la usan en lugar de abrir y cerrar una
 * conexión en cada llamada. Las llamadas de una sesión van en serie.
 */
export interface ExplorerSession {
  /** MySQL/MariaDB: con `database`, antes hace `USE` si hace falta. */
  mysql<T>(database: string | null, fn: (conn: MysqlConnection) => Promise<T>): Promise<T>;
  /** PostgreSQL: un cliente por base, abierto la primera vez que se pide. */
  pg<T>(database: string, fn: (client: PgClient) => Promise<T>): Promise<T>;
  /** Redis: un cliente; antes hace `SELECT` si la base no es la activa. */
  redis<T>(db: number, fn: (client: Redis) => Promise<T>): Promise<T>;
}

export interface SchemaTableColumn {
  name: string;
  type: string;
  nullable: boolean;
  /** `PRI`, `UNI`, `MUL` o vacío, tal como lo da information_schema. */
  key: string;
}

export interface SchemaTable {
  name: string;
  /** Esquema de PostgreSQL (`public`…); no aplica a MySQL. */
  namespace?: string;
  type: 'table' | 'view';
  /** Estimación del motor (InnoDB no lleva la cuenta exacta). */
  rows: number | null;
  columns: SchemaTableColumn[];
}

export interface SchemaTrigger {
  name: string;
  /** BEFORE / AFTER */
  timing: string;
  /** INSERT / UPDATE / DELETE */
  event: string;
  table: string;
  namespace?: string;
}

export interface SchemaIndex {
  name: string;
  table: string;
  unique: boolean;
  /** BTREE, HASH, FULLTEXT… */
  type: string;
  columns: string[];
  namespace?: string;
}

export interface SchemaProcedure {
  name: string;
  /** Lista de parámetros tal como la declara la rutina. */
  params: string;
  comment: string | null;
  namespace?: string;
  /** PostgreSQL: `function` o `procedure`. */
  kind?: 'function' | 'procedure';
}

/** De dónde sale cada columna de un SELECT, para poder editar sus celdas. */
export interface ResultColumnMeta {
  /** Base de datos (en MySQL, el esquema). */
  schema: string | null;
  /** Esquema de PostgreSQL dentro de la base. */
  namespace?: string | null;
  table: string | null;
  /** Nombre real de la columna en la tabla (sin alias). */
  column: string | null;
  /** Grupo de `tableKeys` al que pertenece; null si es un cálculo. */
  source: string | null;
  /** La tabla está entera identificada por su clave primaria en el resultado. */
  editable: boolean;
}

export interface QueryResult {
  /** null cuando la sentencia no devuelve filas (INSERT, UPDATE, DDL…). */
  columns: string[] | null;
  /** Una entrada por columna; solo en sentencias que devuelven filas. */
  columnMeta?: ResultColumnMeta[];
  /** Por cada tabla editable, los índices de las columnas de su clave primaria. */
  tableKeys?: Record<string, number[]>;
  /** Por qué no se puede editar nada del resultado, si es el caso. */
  readOnlyReason?: string | null;
  rows: unknown[][];
  /** Filas devueltas por el motor, aunque se hayan recortado. */
  rowCount: number;
  truncated: boolean;
  affectedRows: number | null;
  insertId: number | null;
  durationMs: number;
}

export interface DatabaseListItem {
  name: string;
  /** Base o esquema del propio motor. */
  system: boolean;
}

export interface UpdateRowInput {
  /** Base de datos (en MySQL, el esquema). */
  schema: string;
  /** Esquema de PostgreSQL; en MySQL no se usa. */
  namespace?: string;
  table: string;
  key: Record<string, unknown>;
  changes: Record<string, unknown>;
}

/** Tabla concreta: base (en MySQL, el esquema) y, en PostgreSQL, su esquema. */
export interface TableRef {
  schema: string;
  namespace?: string;
  table: string;
}

/** Columna de una tabla para el formulario de fila nueva. */
export interface InsertColumn {
  name: string;
  /** Tipo tal como lo escribe el motor (varchar(255), integer, timestamp…). */
  type: string;
  nullable: boolean;
  /** Valor por defecto literal, listo para precargar; null si no hay o es una expresión. */
  defaultValue: string | null;
  /** Lo calcula la base si se deja vacío: autoincremento, identidad o expresión (now(), uuid…). */
  auto: boolean;
  /** La expresión o el motivo de `auto`, para mostrarlo (auto_increment, now()…). */
  autoLabel: string | null;
  /** Columna generada: no se puede escribir. */
  generated: boolean;
  primaryKey: boolean;
}

export interface InsertRowInput extends TableRef {
  /** Columnas a escribir: { columna: valor | null }. Las que no vienen toman su valor por defecto. */
  values: Record<string, unknown>;
}

export interface InsertRowResult {
  affectedRows: number;
  insertId: number | null;
  /** La fila tal como quedó en la tabla { columna: valor }; null si no se pudo identificar. */
  row: Record<string, unknown> | null;
}

export interface DeleteRowsInput extends TableRef {
  /** Clave primaria completa de cada fila: [{ columna: valor original }]. */
  keys: Record<string, unknown>[];
}

/** Filas que se pueden borrar de una vez desde los resultados. */
export const MAX_DELETE_ROWS = 1_000;

/* La clave de cada fila tiene que ser exactamente la primaria: con otra cosa el WHERE podría alcanzar otras filas. */
export function assertPrimaryKeys(pk: string[], keys: Record<string, unknown>[]): void {
  const want = [...pk].sort().join('\u0000');
  if (pk.length === 0) throw new BadRequestException('La tabla no tiene clave primaria: no se pueden borrar filas sueltas');
  if (keys.some(k => Object.keys(k).sort().join('\u0000') !== want)) {
    throw new BadRequestException('Para borrar hace falta la clave primaria completa de cada fila');
  }
}

/* MariaDB y PostgreSQL dan el literal entre comillas ('abc', 'abc'::text): se le quitan. */
export function unquoteDefault(raw: string): string | null {
  const m = /^'((?:[^']|'')*)'(?:::[\w\s".[\]]+)?$/s.exec(raw.trim());
  return m ? m[1].replace(/''/g, "'") : null;
}

/** Filas que viajan a la app como máximo; el resto se cuenta pero no se envía. */
export const MAX_ROWS = 1_000;
/** Exportar trae el resultado completo, con este tope para no agotar la memoria del backend. */
export const EXPORT_MAX_ROWS = 200_000;
export const QUERY_TIMEOUT_MS = 30_000;
export const CONNECT_TIMEOUT_MS = 5_000;

/** Lo que el JSON no representa tal cual: binarios y enteros de 64 bits. */
export function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v.length <= 64 ? `0x${v.toString('hex')}` : `(binario, ${v.length} bytes)`;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? String(v) : v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Primera línea con texto, recortada: algunos comentarios son manuales enteros. */
export const firstLine = (c: string | null | undefined): string | null =>
  c?.split('\n').map(l => l.trim()).find(Boolean)?.slice(0, 200) ?? null;
