/* Tipos y utilidades comunes a los exploradores de MySQL/MariaDB y PostgreSQL. */

import type { Client as PgClient } from 'pg';
import type { Connection as MysqlConnection } from 'mysql2/promise';

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

/** Filas que viajan a la app como máximo; el resto se cuenta pero no se envía. */
export const MAX_ROWS = 1_000;
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
