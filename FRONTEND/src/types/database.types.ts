/* Conexiones a bases de datos del tab Bases de Datos (módulo `databases`
   del backend). */

import type { ResourceTag } from '@utils/tags';

export type DatabaseEngine = 'mysql' | 'mariadb' | 'postgresql' | 'redis';

/** `unknown`: recién creada o editada, todavía sin comprobar. */
export type DatabaseConnectionStatus = 'unknown' | 'connected' | 'disconnected';

/** Conexión tal como la devuelve `GET /databases`: nunca trae la contraseña. */
export interface DatabaseConnection {
  id: string;
  /** Nombre que el usuario le da a la conexión. */
  name: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  /** Base a la que apunta la conexión; null conecta al servidor completo. En Redis, el índice. */
  database: string | null;
  /** Una sola etiqueta, opcional. */
  tag: ResourceTag | null;
  hasPassword: boolean;
  status: DatabaseConnectionStatus;
  /** Versión que reportó el motor en la última comprobación correcta. */
  version: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

/** Resultado de `POST /databases/test`. */
export interface DatabaseTestResult {
  ok: boolean;
  version: string | null;
  error: string | null;
  latencyMs: number;
}

export const DATABASE_ENGINE_LABELS: Record<DatabaseEngine, string> = {
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  postgresql: 'PostgreSQL',
  redis: 'Redis',
};

/** Motores soportados, en el orden en que se ofrecen en el formulario. */
export const DATABASE_ENGINES: DatabaseEngine[] = ['mysql', 'mariadb', 'postgresql', 'redis'];

export const DATABASE_DEFAULT_PORTS: Record<DatabaseEngine, number> = {
  mysql: 3306,
  mariadb: 3306,
  postgresql: 5432,
  redis: 6379,
};

/** Datos del formulario de nueva conexión. */
export interface DatabaseConnectionForm {
  engine: DatabaseEngine;
  name: string;
  host: string;
  port: number;
  username: string;
  /** En una edición, `undefined` conserva la guardada y '' la borra. */
  password?: string;
  /** En Redis es el índice de la base (0–15). Vacío: servidor completo. */
  database: string;
  /** null: sin etiqueta. */
  tag: ResourceTag | null;
}

/* ── Gestión (vista de una conexión) ─────────────────────────────── */

/** Motores que ya se pueden explorar y consultar desde el panel. */
export const MANAGEABLE_ENGINES: DatabaseEngine[] = ['mysql', 'mariadb', 'postgresql'];

export interface DatabaseSchema {
  name: string;
  /** Esquema del propio motor (information_schema, mysql…). */
  system: boolean;
}

export interface SchemaTableColumn {
  name: string;
  type: string;
  nullable: boolean;
  /** `PRI`, `UNI`, `MUL` o vacío. */
  key: string;
}

export interface SchemaTable {
  name: string;
  /** Esquema de PostgreSQL (`public`…). */
  namespace?: string;
  type: 'table' | 'view';
  /** Estimación del motor. */
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
  params: string;
  comment: string | null;
  namespace?: string;
  /** PostgreSQL: función o procedimiento. */
  kind?: 'function' | 'procedure';
}

/** Secciones de una base en el árbol; cada una es una ruta del backend. */
export interface SchemaSections {
  tables: SchemaTable[];
  views: SchemaTable[];
  triggers: SchemaTrigger[];
  indexes: SchemaIndex[];
  procedures: SchemaProcedure[];
}
export type SchemaSection = keyof SchemaSections;

/** De dónde sale cada columna de un SELECT (para editar celdas). */
export interface ResultColumnMeta {
  schema: string | null;
  /** Esquema de PostgreSQL dentro de la base. */
  namespace?: string | null;
  table: string | null;
  /** Nombre real de la columna en la tabla, sin alias. */
  column: string | null;
  /** Clave de `tableKeys`; null en columnas calculadas. */
  source: string | null;
  editable: boolean;
}

/** Resultado de `POST /databases/:id/query`. */
export interface QueryResult {
  /** null cuando la sentencia no devuelve filas (INSERT, UPDATE, DDL…). */
  columns: string[] | null;
  columnMeta?: ResultColumnMeta[];
  /** Por tabla editable, índices de las columnas de su clave primaria. */
  tableKeys?: Record<string, number[]>;
  /** Motivo por el que nada del resultado es editable. */
  readOnlyReason?: string | null;
  rows: unknown[][];
  rowCount: number;
  /** El backend envía hasta 1000 filas. */
  truncated: boolean;
  affectedRows: number | null;
  insertId: number | null;
  durationMs: number;
}

/** Consulta peligrosa confirmada (`GET /databases/:id/audit`). */
export interface DatabaseQueryAuditEntry {
  id: string;
  schema: string | null;
  query: string;
  /** Motivo por el que pidió confirmación. */
  reason: string;
  status: 'ok' | 'error';
  affectedRows: number | null;
  error: string | null;
  durationMs: number;
  createdAt: string;
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
  type: string;
  nullable: boolean;
  /** Valor por defecto literal, para precargar. */
  defaultValue: string | null;
  /** Lo calcula la base si se deja vacío (autoincremento, identidad, now()…). */
  auto: boolean;
  autoLabel: string | null;
  /** Generada: no se puede escribir. */
  generated: boolean;
  primaryKey: boolean;
}
