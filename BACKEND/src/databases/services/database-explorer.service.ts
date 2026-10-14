import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type Connection,
  type FieldPacket,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import { DatabaseEngine } from '../entities/database-connection.entity';
import type { ProbeTarget } from './database-probe.service';
import { PostgresExplorerService } from './postgres-explorer.service';
import { openMysql } from './connection-factory';
import {
  MAX_ROWS,
  QUERY_TIMEOUT_MS,
  firstLine,
  serializeValue,
  type DatabaseListItem,
  type QueryResult,
  type ResultColumnMeta,
  type SchemaIndex,
  type SchemaProcedure,
  type SchemaTable,
  type SchemaTableColumn,
  type SchemaTrigger,
  type UpdateRowInput,
  type InsertColumn,
  type InsertRowInput,
  type TableRef,
  type DeleteRowsInput,
  type InsertRowResult,
  MAX_DELETE_ROWS,
  assertPrimaryKeys,
  unquoteDefault,
} from './explorer.common';

export type {
  DeleteRowsInput,
  InsertRowResult,
  InsertColumn,
  InsertRowInput,
  TableRef,
  DatabaseListItem,
  QueryResult,
  ResultColumnMeta,
  SchemaIndex,
  SchemaProcedure,
  SchemaTable,
  SchemaTableColumn,
  SchemaTrigger,
  UpdateRowInput,
} from './explorer.common';

interface TableRow extends RowDataPacket {
  name: string;
  type: string;
  rows: number | string | null;
}

interface TriggerRow extends RowDataPacket {
  name: string;
  timing: string;
  event: string;
  tbl: string;
}

interface IndexRow extends RowDataPacket {
  name: string;
  tbl: string;
  nonUnique: number | string;
  type: string;
  col: string;
}

interface ProcedureRow extends RowDataPacket {
  name: string;
  params: string | null;
  comment: string | null;
}

interface ColumnRow extends RowDataPacket {
  tbl: string;
  name: string;
  type: string;
  nullable: 'YES' | 'NO';
  key: string | null;
}

/* Esquemas del propio motor: se listan al final para no tapar los del usuario. */
const SYSTEM_SCHEMAS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);

/**
 * Exploración y consultas sobre una conexión: bases y, dentro de cada una,
 * tablas y vistas con sus columnas, triggers, índices y procedimientos; y
 * ejecución de SQL. Cada sección se pide aparte, al desplegarla en el árbol.
 *
 * Esta clase implementa MySQL y MariaDB; PostgreSQL va en
 * `PostgresExplorerService` y cada método público le pasa la llamada.
 */
@Injectable()
export class DatabaseExplorerService {
  constructor(private readonly pg: PostgresExplorerService) {}

  private isPg(t: ProbeTarget): boolean {
    return t.engine === DatabaseEngine.POSTGRESQL;
  }

  async listSchemas(t: ProbeTarget): Promise<DatabaseListItem[]> {
    if (this.isPg(t)) return this.pg.listSchemas(t);
    this.assertSupported(t);
    /* Conexión apuntada a una base: solo esa, como pidió el usuario al crearla. */
    if (t.database) return [{ name: t.database, system: SYSTEM_SCHEMAS.has(t.database) }];

    return this.withMysql(t, null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>('SHOW DATABASES');
      return rows
        .map(r => String(Object.values(r)[0]))
        .map(name => ({ name, system: SYSTEM_SCHEMAS.has(name) }))
        .sort((a, b) => Number(a.system) - Number(b.system) || a.name.localeCompare(b.name));
    });
  }

  /**
   * Bases que el usuario puede ver en el servidor, sin importar a cuál apunte
   * la conexión: alimenta el selector de base del formulario.
   */
  async listAvailableDatabases(t: ProbeTarget): Promise<DatabaseListItem[]> {
    return this.listSchemas({ ...t, database: null });
  }

  /** Tablas (`kind: 'table'`) o vistas (`'view'`), cada una con sus columnas. */
  async listTables(t: ProbeTarget, schema: string, kind: 'table' | 'view' = 'table'): Promise<SchemaTable[]> {
    if (this.isPg(t)) return this.pg.listTables(t, schema, kind);
    this.assertSupported(t);
    this.assertSchemaAllowed(t, schema);
    /* MariaDB marca las tablas del sistema como `SYSTEM VIEW` / `SYSTEM VERSIONED`. */
    const typeFilter = kind === 'view' ? "TABLE_TYPE LIKE '%VIEW'" : "TABLE_TYPE NOT LIKE '%VIEW'";

    return this.withMysql(t, null, async (conn) => {
      const [tables] = await conn.query<TableRow[]>(
        `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS \`rows\`
           FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND ${typeFilter}
          ORDER BY TABLE_NAME`,
        [schema],
      );
      const [columns] = await conn.query<ColumnRow[]>(
        `SELECT c.TABLE_NAME AS tbl, c.COLUMN_NAME AS name, c.COLUMN_TYPE AS type,
                c.IS_NULLABLE AS nullable, c.COLUMN_KEY AS \`key\`
           FROM information_schema.COLUMNS c
           JOIN information_schema.TABLES t
             ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
          WHERE c.TABLE_SCHEMA = ? AND t.${typeFilter}
          ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
        [schema],
      );

      const byTable = new Map<string, SchemaTableColumn[]>();
      for (const c of columns) {
        const list = byTable.get(c.tbl) ?? [];
        list.push({ name: c.name, type: c.type, nullable: c.nullable === 'YES', key: c.key ?? '' });
        byTable.set(c.tbl, list);
      }

      return tables.map((tb): SchemaTable => ({
        name: tb.name,
        type: /VIEW/i.test(tb.type) ? 'view' : 'table',
        rows: tb.rows === null || tb.rows === undefined ? null : Number(tb.rows),
        columns: byTable.get(tb.name) ?? [],
      }));
    });
  }

  async listTriggers(t: ProbeTarget, schema: string): Promise<SchemaTrigger[]> {
    if (this.isPg(t)) return this.pg.listTriggers(t, schema);
    this.assertSupported(t);
    this.assertSchemaAllowed(t, schema);
    return this.withMysql(t, null, async (conn) => {
      const [rows] = await conn.query<TriggerRow[]>(
        `SELECT TRIGGER_NAME AS name, ACTION_TIMING AS timing,
                EVENT_MANIPULATION AS event, EVENT_OBJECT_TABLE AS tbl
           FROM information_schema.TRIGGERS
          WHERE TRIGGER_SCHEMA = ?
          ORDER BY TRIGGER_NAME`,
        [schema],
      );
      return rows.map(r => ({ name: r.name, timing: r.timing, event: r.event, table: r.tbl }));
    });
  }

  async listIndexes(t: ProbeTarget, schema: string): Promise<SchemaIndex[]> {
    if (this.isPg(t)) return this.pg.listIndexes(t, schema);
    this.assertSupported(t);
    this.assertSchemaAllowed(t, schema);
    return this.withMysql(t, null, async (conn) => {
      /* Una fila por columna del índice: se agrupan en orden de SEQ_IN_INDEX. */
      const [rows] = await conn.query<IndexRow[]>(
        `SELECT INDEX_NAME AS name, TABLE_NAME AS tbl, NON_UNIQUE AS nonUnique,
                INDEX_TYPE AS type, COLUMN_NAME AS col
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = ?
          ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
        [schema],
      );
      const byKey = new Map<string, SchemaIndex>();
      for (const r of rows) {
        const key = `${r.tbl}\u0000${r.name}`;
        const idx = byKey.get(key) ?? {
          name: r.name, table: r.tbl, unique: Number(r.nonUnique) === 0, type: r.type, columns: [],
        };
        if (r.col) idx.columns.push(r.col);
        byKey.set(key, idx);
      }
      return [...byKey.values()];
    });
  }

  async listProcedures(t: ProbeTarget, schema: string): Promise<SchemaProcedure[]> {
    if (this.isPg(t)) return this.pg.listProcedures(t, schema);
    this.assertSupported(t);
    this.assertSchemaAllowed(t, schema);
    return this.withMysql(t, null, async (conn) => {
      /* Los parámetros salen de PARAMETERS: ROUTINES no los trae en MySQL. */
      const [rows] = await conn.query<ProcedureRow[]>(
        `SELECT r.ROUTINE_NAME AS name, r.ROUTINE_COMMENT AS comment,
                GROUP_CONCAT(CONCAT_WS(' ', p.PARAMETER_MODE, p.PARAMETER_NAME, p.DTD_IDENTIFIER)
                             ORDER BY p.ORDINAL_POSITION SEPARATOR ', ') AS params
           FROM information_schema.ROUTINES r
           LEFT JOIN information_schema.PARAMETERS p
             ON p.SPECIFIC_SCHEMA = r.ROUTINE_SCHEMA AND p.SPECIFIC_NAME = r.SPECIFIC_NAME
            AND p.ORDINAL_POSITION > 0
          WHERE r.ROUTINE_SCHEMA = ? AND r.ROUTINE_TYPE = 'PROCEDURE'
          GROUP BY r.ROUTINE_NAME, r.ROUTINE_COMMENT
          ORDER BY r.ROUTINE_NAME`,
        [schema],
      );
      return rows.map(r => ({ name: r.name, params: r.params ?? '', comment: firstLine(r.comment) }));
    });
  }

  async runQuery(t: ProbeTarget, sql: string, schema: string | null, maxRows = MAX_ROWS): Promise<QueryResult> {
    if (this.isPg(t)) return this.pg.runQuery(t, sql, schema, maxRows);
    this.assertSupported(t);
    if (schema) this.assertSchemaAllowed(t, schema);

    return this.withMysql(t, schema ?? t.database, async (conn) => {
      const started = Date.now();
      let result: unknown;
      let fields: FieldPacket[] | undefined;
      try {
        [result, fields] = await conn.query({ sql, rowsAsArray: true, timeout: QUERY_TIMEOUT_MS });
      } catch (err) {
        /* Un error de SQL es una respuesta válida para el editor, no un 500. */
        throw new BadRequestException(describeSqlError(err));
      }
      const durationMs = Date.now() - started;

      if (Array.isArray(result) && fields) {
        const rows = result as unknown[][];
        const editing = await this.describeEditable(conn, fields);
        return {
          columns: fields.map(f => f.name),
          ...editing,
          rows: rows.slice(0, maxRows).map(row => row.map(serializeValue)),
          rowCount: rows.length,
          truncated: rows.length > maxRows,
          affectedRows: null,
          insertId: null,
          durationMs,
        };
      }

      const header = result as ResultSetHeader;
      return {
        columns: null,
        rows: [],
        rowCount: 0,
        truncated: false,
        affectedRows: header?.affectedRows ?? 0,
        insertId: header?.insertId || null,
        durationMs,
      };
    });
  }

  /**
   * Qué columnas del resultado se pueden editar. Una tabla es editable si su
   * clave primaria completa está en el resultado (así cada fila se puede
   * actualizar sin tocar otra). Las columnas se agrupan por tabla y alias:
   * en un self-join cada alias es su propia fuente.
   */
  private async describeEditable(conn: Connection, fields: FieldPacket[]): Promise<{
    columnMeta: ResultColumnMeta[];
    tableKeys: Record<string, number[]>;
    readOnlyReason: string | null;
  }> {
    const sourceOf = (f: FieldPacket) =>
      f.orgTable && f.db ? `${f.db}.${f.orgTable}.${f.table || f.orgTable}` : null;

    const sources = new Map<string, { schema: string; table: string }>();
    for (const f of fields) {
      const key = sourceOf(f);
      if (key && f.db) sources.set(key, { schema: f.db, table: f.orgTable });
    }

    const tableKeys: Record<string, number[]> = {};
    const reasons: string[] = [];
    for (const [key, src] of sources) {
      const [pkRows] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME AS col FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
          ORDER BY ORDINAL_POSITION`,
        [src.schema, src.table],
      );
      const pk = pkRows.map(r => String(r.col));
      if (pk.length === 0) {
        reasons.push(`la tabla ${src.table} no tiene clave primaria`);
        continue;
      }
      const indices = pk.map(col => fields.findIndex(f => sourceOf(f) === key && f.orgName === col));
      if (indices.some(i => i < 0)) {
        reasons.push(`incluye la clave primaria de ${src.table} (${pk.join(', ')}) en el SELECT para poder editarla`);
        continue;
      }
      tableKeys[key] = indices;
    }

    const columnMeta = fields.map((f): ResultColumnMeta => {
      const source = sourceOf(f);
      return {
        schema: f.db || null,
        table: f.orgTable || null,
        column: f.orgName || null,
        source,
        editable: Boolean(source && tableKeys[source] && f.orgName),
      };
    });

    let readOnlyReason: string | null = null;
    if (!columnMeta.some(c => c.editable)) {
      readOnlyReason = sources.size === 0
        ? 'Solo lectura: el resultado no sale directamente de una tabla'
        : `Solo lectura: ${reasons[0] ?? 'no se puede identificar cada fila'}`;
    }
    return { columnMeta, tableKeys, readOnlyReason };
  }

  /**
   * Actualiza una sola fila identificada por su clave primaria completa. Las
   * columnas se validan contra information_schema y los valores van como
   * parámetros: nada de lo que llega se concatena al SQL sin escapar.
   */
  async updateRow(t: ProbeTarget, input: UpdateRowInput): Promise<{ affectedRows: number }> {
    if (this.isPg(t)) return this.pg.updateRow(t, input);
    this.assertSupported(t);
    this.assertSchemaAllowed(t, input.schema);
    const changeCols = Object.keys(input.changes);
    if (changeCols.length === 0) throw new BadRequestException('No hay cambios que guardar');

    return this.withMysql(t, null, async (conn) => {
      const [colRows] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME AS col, COLUMN_KEY AS k, ORDINAL_POSITION AS pos
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [input.schema, input.table],
      );
      if (colRows.length === 0) throw new BadRequestException(`La tabla ${input.table} no existe`);
      const existing = new Set(colRows.map(r => String(r.col)));

      const [pkRows] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME AS col FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
        [input.schema, input.table],
      );
      const pk = pkRows.map(r => String(r.col)).sort();
      const sentKey = Object.keys(input.key).sort();
      /* La clave tiene que ser exactamente la primaria: con otra cosa el
         WHERE podría alcanzar varias filas. */
      if (pk.length === 0 || pk.join('\u0000') !== sentKey.join('\u0000')) {
        throw new BadRequestException('Para editar hace falta la clave primaria completa de la fila');
      }
      const unknown = changeCols.filter(c => !existing.has(c));
      if (unknown.length) throw new BadRequestException(`Columnas desconocidas: ${unknown.join(', ')}`);

      const sql =
        `UPDATE ${conn.escapeId(input.schema)}.${conn.escapeId(input.table)} SET ` +
        changeCols.map(c => `${conn.escapeId(c)} = ?`).join(', ') +
        ' WHERE ' + pk.map(c => `${conn.escapeId(c)} <=> ?`).join(' AND ') +
        ' LIMIT 1';
      const params = [...changeCols.map(c => input.changes[c]), ...pk.map(c => input.key[c])];

      try {
        const [res] = await conn.query<ResultSetHeader>({ sql, values: params, timeout: QUERY_TIMEOUT_MS });
        if (res.affectedRows === 0) {
          throw new BadRequestException('La fila ya no existe o cambió su clave: vuelve a ejecutar la consulta');
        }
        return { affectedRows: res.affectedRows };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(describeSqlError(err));
      }
    });
  }

  /**
   * Columnas de una tabla con su tipo, si admiten NULL y su valor por
   * defecto, para el formulario de fila nueva. MySQL da el valor tal cual y
   * MariaDB como literal SQL ('abc', NULL, current_timestamp()): se unifica.
   */
  async tableColumns(t: ProbeTarget, ref: TableRef): Promise<InsertColumn[]> {
    if (this.isPg(t)) return this.pg.tableColumns(t, ref);
    this.assertSupported(t);
    this.assertSchemaAllowed(t, ref.schema);
    return this.withMysql(t, null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def,
                EXTRA AS extra, COLUMN_KEY AS k
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION`,
        [ref.schema, ref.table],
      );
      if (rows.length === 0) throw new BadRequestException(`La tabla ${ref.table} no existe`);
      const mariadb = t.engine === DatabaseEngine.MARIADB;
      return rows.map((r): InsertColumn => {
        const extra = String(r.extra ?? '').toLowerCase();
        const raw = r.def === null || r.def === undefined ? null : String(r.def);
        const generated = /virtual generated|stored generated|persistent/.test(extra);
        /* MariaDB: NULL como texto y literales entre comillas; lo demás es una expresión. */
        const literal = raw === null || (mariadb && raw === 'NULL') ? null
          : mariadb ? unquoteDefault(raw) ?? (/^-?\d+(\.\d+)?$/.test(raw) ? raw : null)
            : extra.includes('default_generated') ? null : raw;
        const expression = raw !== null && literal === null && !(mariadb && raw === 'NULL') ? raw : null;
        const autoIncrement = extra.includes('auto_increment');
        return {
          name: String(r.name),
          type: String(r.type),
          nullable: r.nullable === 'YES',
          defaultValue: literal,
          auto: autoIncrement || expression !== null,
          autoLabel: autoIncrement ? 'auto_increment' : expression,
          generated,
          primaryKey: r.k === 'PRI',
        };
      });
    });
  }

  /**
   * Inserta una fila. Solo se escriben las columnas recibidas (las demás
   * toman su valor por defecto); se validan contra la tabla y los valores van
   * como parámetros. Devuelve la fila tal como quedó (con el id y lo que
   * calculó la base), leída por su clave primaria: la enviada o, si es un
   * autoincremento, el `insertId`. Sin forma de identificarla, `row` es null.
   */
  async insertRow(t: ProbeTarget, input: InsertRowInput): Promise<InsertRowResult> {
    if (this.isPg(t)) return this.pg.insertRow(t, input);
    const columns = await this.tableColumns(t, input);
    const cols = Object.keys(input.values);
    const known = new Map(columns.map(c => [c.name, c]));
    const unknown = cols.filter(c => !known.has(c));
    if (unknown.length) throw new BadRequestException(`Columnas desconocidas: ${unknown.join(', ')}`);
    const generated = cols.filter(c => known.get(c)?.generated);
    if (generated.length) throw new BadRequestException(`Columnas generadas, no se pueden escribir: ${generated.join(', ')}`);

    return this.withMysql(t, null, async (conn) => {
      const target = `${conn.escapeId(input.schema)}.${conn.escapeId(input.table)}`;
      const sql = cols.length
        ? `INSERT INTO ${target} (${cols.map(c => conn.escapeId(c)).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
        : `INSERT INTO ${target} () VALUES ()`;
      let res: ResultSetHeader;
      try {
        [res] = await conn.query<ResultSetHeader>({ sql, values: cols.map(c => input.values[c]), timeout: QUERY_TIMEOUT_MS });
      } catch (err) {
        throw new BadRequestException(describeSqlError(err));
      }
      const insertId = res.insertId || null;

      const pk = columns.filter(c => c.primaryKey).map(c => c.name);
      let key: Record<string, unknown> | null = null;
      if (pk.length && pk.every(c => c in input.values)) key = Object.fromEntries(pk.map(c => [c, input.values[c]]));
      else if (pk.length === 1 && insertId !== null && known.get(pk[0])?.auto) key = { [pk[0]]: insertId };
      let row: Record<string, unknown> | null = null;
      if (key) {
        const [found] = await conn.query<RowDataPacket[]>({
          sql: `SELECT * FROM ${target} WHERE ${Object.keys(key).map(c => `${conn.escapeId(c)} <=> ?`).join(' AND ')} LIMIT 1`,
          values: Object.values(key),
          timeout: QUERY_TIMEOUT_MS,
        });
        if (found[0]) row = Object.fromEntries(Object.entries(found[0]).map(([k, v]) => [k, serializeValue(v)]));
      }
      return { affectedRows: res.affectedRows, insertId, row };
    });
  }

  /**
   * Borra filas por su clave primaria completa, en una transacción: o se
   * borran todas o ninguna. Cada DELETE lleva LIMIT 1 y valores parametrizados.
   */
  async deleteRows(t: ProbeTarget, input: DeleteRowsInput): Promise<{ affectedRows: number }> {
    if (this.isPg(t)) return this.pg.deleteRows(t, input);
    this.assertSupported(t);
    this.assertSchemaAllowed(t, input.schema);
    if (input.keys.length === 0) throw new BadRequestException('No hay filas que borrar');
    if (input.keys.length > MAX_DELETE_ROWS) throw new BadRequestException(`Se pueden borrar hasta ${MAX_DELETE_ROWS} filas de una vez`);

    return this.withMysql(t, null, async (conn) => {
      const [pkRows] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME AS col FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
          ORDER BY ORDINAL_POSITION`,
        [input.schema, input.table],
      );
      const pk = pkRows.map(r => String(r.col));
      assertPrimaryKeys(pk, input.keys);
      const sql =
        `DELETE FROM ${conn.escapeId(input.schema)}.${conn.escapeId(input.table)} WHERE ` +
        pk.map(c => `${conn.escapeId(c)} <=> ?`).join(' AND ') + ' LIMIT 1';

      let affected = 0;
      try {
        await conn.beginTransaction();
        for (const key of input.keys) {
          const [res] = await conn.query<ResultSetHeader>({ sql, values: pk.map(c => key[c]), timeout: QUERY_TIMEOUT_MS });
          affected += res.affectedRows;
        }
        await conn.commit();
        return { affectedRows: affected };
      } catch (err) {
        await conn.rollback().catch(() => undefined);
        throw new BadRequestException(describeSqlError(err));
      }
    });
  }

  private assertSupported(t: ProbeTarget) {
    if (t.engine !== DatabaseEngine.MYSQL && t.engine !== DatabaseEngine.MARIADB) {
      throw new BadRequestException('La gestión de este motor todavía no está disponible');
    }
  }

  /* Una conexión apuntada a una base no da acceso a las demás desde el panel. */
  private assertSchemaAllowed(t: ProbeTarget, schema: string) {
    if (t.database && t.database !== schema) {
      throw new BadRequestException('Esta conexión solo da acceso a la base ' + t.database);
    }
  }

  /* Con sesión, su conexión (en serie con el resto de llamadas); sin ella,
     una conexión para esta llamada que se cierra al terminar. */
  private async withMysql<T>(t: ProbeTarget, database: string | null, fn: (conn: Connection) => Promise<T>): Promise<T> {
    if (t.session) return t.session.mysql(database, fn);
    let conn: Connection;
    try {
      conn = await openMysql(t, database);
    } catch (err) {
      throw new BadRequestException(describeSqlError(err));
    }
    try {
      return await fn(conn);
    } finally {
      await conn.end().catch(() => undefined);
    }
  }

}

export function describeSqlError(err: unknown): string {
  const e = err as { code?: string; sqlMessage?: string; message?: string };
  if (e?.code === 'ECONNREFUSED') return 'Conexión rechazada: el motor no escucha en ese host y puerto';
  if (e?.code === 'ETIMEDOUT') return 'Tiempo de espera agotado';
  if (e?.code === 'PROTOCOL_SEQUENCE_TIMEOUT') return 'La consulta superó el tiempo máximo de 30 s';
  if (e?.code === 'ER_ACCESS_DENIED_ERROR') return 'Usuario o contraseña incorrectos';
  if (e?.code === 'ER_BAD_DB_ERROR') return 'La base de datos no existe';
  if (e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN') return 'No se encontró el host';
  return e?.sqlMessage ?? e?.message ?? String(err);
}
