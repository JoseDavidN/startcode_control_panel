import { BadRequestException, Injectable } from '@nestjs/common';
import { Query, type Client, type FieldDef, type QueryConfig } from 'pg';
import { openPg } from './connection-factory';
import type { ProbeTarget } from './database-probe.service';
import {
  MAX_ROWS,
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
  assertIdentifier,
  unquoteDefault,
} from './explorer.common';

/* Esquemas internos de PostgreSQL: no se listan en el árbol. */
const USER_NAMESPACES = `n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'`;

/** Orden del árbol: `public` primero, luego el resto de esquemas. */
const NS_ORDER = `(n.nspname = 'public') DESC, n.nspname`;

/**
 * Exploración y consultas sobre PostgreSQL. El nivel «base de datos» del
 * árbol son las bases del servidor (cada llamada abre la conexión sobre la
 * que toca); dentro, tablas y demás objetos de todos los esquemas del
 * usuario, cada uno con su `namespace`.
 *
 * Las consultas van por el protocolo extendido: admite una sola sentencia,
 * igual que MySQL con `multipleStatements: false`. Sin eso un
 * `SELECT 1; DROP TABLE x` saltaría la confirmación de consultas peligrosas,
 * que mira el inicio de la sentencia.
 */
@Injectable()
export class PostgresExplorerService {
  async listSchemas(t: ProbeTarget): Promise<DatabaseListItem[]> {
    if (t.database) return [{ name: t.database, system: t.database === 'postgres' }];
    return this.withPg(t, null, async (client) => {
      /* Solo las que el usuario puede abrir; las plantillas no son bases de trabajo. */
      const res = await client.query<{ name: string }>(
        `SELECT datname AS name FROM pg_database
          WHERE NOT datistemplate AND has_database_privilege(datname, 'CONNECT')
          ORDER BY datname`,
      );
      return res.rows
        .map(r => ({ name: r.name, system: r.name === 'postgres' }))
        .sort((a, b) => Number(a.system) - Number(b.system) || a.name.localeCompare(b.name));
    });
  }

  async listTables(t: ProbeTarget, database: string, kind: 'table' | 'view'): Promise<SchemaTable[]> {
    this.assertDatabaseAllowed(t, database);
    /* r: tabla, p: tabla particionada; v: vista, m: vista materializada. */
    const kinds = kind === 'view' ? ['v', 'm'] : ['r', 'p'];

    return this.withPg(t, database, async (client) => {
      const tables = await client.query<{ ns: string; name: string; rows: string | null }>(
        `SELECT n.nspname AS ns, c.relname AS name,
                CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS rows
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = ANY($1) AND ${USER_NAMESPACES}
          ORDER BY ${NS_ORDER}, c.relname`,
        [kinds],
      );
      const columns = await client.query<{ ns: string; tbl: string; name: string; type: string; nullable: boolean; pk: boolean }>(
        `SELECT n.nspname AS ns, c.relname AS tbl, a.attname AS name,
                format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
                EXISTS (SELECT 1 FROM pg_index i
                         WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)) AS pk
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind = ANY($1) AND ${USER_NAMESPACES}
          ORDER BY n.nspname, c.relname, a.attnum`,
        [kinds],
      );

      const byTable = new Map<string, SchemaTableColumn[]>();
      for (const c of columns.rows) {
        const key = `${c.ns}.${c.tbl}`;
        const list = byTable.get(key) ?? [];
        list.push({ name: c.name, type: c.type, nullable: c.nullable, key: c.pk ? 'PRI' : '' });
        byTable.set(key, list);
      }

      return tables.rows.map((tb): SchemaTable => ({
        name: tb.name,
        namespace: tb.ns,
        type: kind,
        rows: tb.rows === null ? null : Number(tb.rows),
        columns: byTable.get(`${tb.ns}.${tb.name}`) ?? [],
      }));
    });
  }

  async listTriggers(t: ProbeTarget, database: string): Promise<SchemaTrigger[]> {
    this.assertDatabaseAllowed(t, database);
    return this.withPg(t, database, async (client) => {
      const res = await client.query<{ name: string; ns: string; tbl: string; tgtype: number }>(
        `SELECT tg.tgname AS name, n.nspname AS ns, c.relname AS tbl, tg.tgtype::int AS tgtype
           FROM pg_trigger tg
           JOIN pg_class c ON c.oid = tg.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE NOT tg.tgisinternal AND ${USER_NAMESPACES}
          ORDER BY ${NS_ORDER}, tg.tgname`,
      );
      /* tgtype es un mapa de bits: 2 BEFORE, 64 INSTEAD OF; 4 INSERT, 8 DELETE,
         16 UPDATE, 32 TRUNCATE. */
      return res.rows.map(r => {
        const events = [[4, 'INSERT'], [16, 'UPDATE'], [8, 'DELETE'], [32, 'TRUNCATE']]
          .filter(([bit]) => (r.tgtype & (bit as number)) !== 0).map(([, name]) => name);
        const timing = r.tgtype & 64 ? 'INSTEAD OF' : r.tgtype & 2 ? 'BEFORE' : 'AFTER';
        return { name: r.name, namespace: r.ns, table: r.tbl, timing, event: events.join(' OR ') };
      });
    });
  }

  async listIndexes(t: ProbeTarget, database: string): Promise<SchemaIndex[]> {
    this.assertDatabaseAllowed(t, database);
    return this.withPg(t, database, async (client) => {
      /* attname::text: el driver no convierte un array de tipo name a lista. */
      const res = await client.query<{ ns: string; tbl: string; name: string; uq: boolean; type: string; cols: string[] }>(
        `SELECT n.nspname AS ns, tb.relname AS tbl, ic.relname AS name, ix.indisunique AS uq,
                am.amname AS type,
                ARRAY(SELECT COALESCE(a.attname::text, '(expresión)')
                        FROM unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                        LEFT JOIN pg_attribute a ON a.attrelid = tb.oid AND a.attnum = k.attnum
                       ORDER BY k.ord) AS cols
           FROM pg_index ix
           JOIN pg_class ic ON ic.oid = ix.indexrelid
           JOIN pg_class tb ON tb.oid = ix.indrelid
           JOIN pg_namespace n ON n.oid = tb.relnamespace
           JOIN pg_am am ON am.oid = ic.relam
          WHERE ${USER_NAMESPACES}
          ORDER BY ${NS_ORDER}, tb.relname, ic.relname`,
      );
      return res.rows.map(r => ({
        name: r.name, namespace: r.ns, table: r.tbl, unique: r.uq, type: r.type.toUpperCase(), columns: r.cols,
      }));
    });
  }

  /** Funciones y procedimientos del usuario (sin los que trae una extensión). */
  async listProcedures(t: ProbeTarget, database: string): Promise<SchemaProcedure[]> {
    this.assertDatabaseAllowed(t, database);
    return this.withPg(t, database, async (client) => {
      const res = await client.query<{ ns: string; name: string; params: string; comment: string | null; kind: string }>(
        `SELECT n.nspname AS ns, p.proname AS name, pg_get_function_arguments(p.oid) AS params,
                obj_description(p.oid, 'pg_proc') AS comment, p.prokind AS kind
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.prokind IN ('f', 'p') AND ${USER_NAMESPACES}
            AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
          ORDER BY ${NS_ORDER}, p.proname`,
      );
      return res.rows.map(r => ({
        name: r.name,
        namespace: r.ns,
        params: r.params ?? '',
        comment: firstLine(r.comment),
        kind: r.kind === 'p' ? 'procedure' : 'function',
      }));
    });
  }

  async runQuery(t: ProbeTarget, sql: string, database: string | null, maxRows = MAX_ROWS): Promise<QueryResult> {
    if (database) this.assertDatabaseAllowed(t, database);
    const db = database ?? t.database ?? 'postgres';

    return this.withPg(t, db, async (client) => {
      const started = Date.now();
      let res: StreamedPgResult;
      try {
        res = await streamPgQuery(client, sql, maxRows);
      } catch (err) {
        throw new BadRequestException(describePgError(err));
      }
      const durationMs = Date.now() - started;

      if (res.fields?.length) {
        return {
          columns: res.fields.map(f => f.name),
          ...(await this.describeEditable(client, res.fields, db)),
          rows: res.rows.map(row => row.map(serializeValue)),
          rowCount: res.received,
          truncated: res.received > maxRows,
          affectedRows: null,
          insertId: null,
          durationMs,
        };
      }

      return {
        columns: null,
        rows: [],
        rowCount: 0,
        truncated: false,
        affectedRows: res.rowCount ?? 0,
        insertId: null,
        durationMs,
      };
    });
  }

  /**
   * Qué columnas del resultado se pueden editar. Cada campo trae el oid de su
   * tabla y su número de columna, así que no hace falta adivinar por nombre.
   * Una tabla es editable si es una tabla de verdad (no una vista), tiene
   * clave primaria y está completa en el resultado. A diferencia de MySQL, el
   * protocolo no distingue alias: si una columna aparece dos veces (un
   * self-join), esa tabla queda en solo lectura para no tomar la clave de la
   * fila equivocada.
   */
  private async describeEditable(client: Client, fields: FieldDef[], database: string): Promise<{
    columnMeta: ResultColumnMeta[];
    tableKeys: Record<string, number[]>;
    readOnlyReason: string | null;
  }> {
    const oids = [...new Set(fields.map(f => f.tableID).filter(Boolean))];
    const empty = fields.map((): ResultColumnMeta => ({
      schema: null, namespace: null, table: null, column: null, source: null, editable: false,
    }));
    if (oids.length === 0) {
      return { columnMeta: empty, tableKeys: {}, readOnlyReason: 'Solo lectura: el resultado no sale directamente de una tabla' };
    }

    const rels = await client.query<{ oid: number; ns: string; name: string; kind: string; pk: number[] | null }>(
      `SELECT c.oid::int AS oid, n.nspname AS ns, c.relname AS name, c.relkind AS kind,
              (SELECT i.indkey::int2[] FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary) AS pk
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.oid = ANY($1::oid[])`,
      [oids],
    );
    const atts = await client.query<{ rel: number; num: number; name: string }>(
      `SELECT attrelid::int AS rel, attnum::int AS num, attname AS name
         FROM pg_attribute WHERE attrelid = ANY($1::oid[]) AND attnum > 0 AND NOT attisdropped`,
      [oids],
    );
    const attName = new Map(atts.rows.map(a => [`${a.rel}:${a.num}`, a.name]));
    const relById = new Map(rels.rows.map(r => [r.oid, r]));

    const tableKeys: Record<string, number[]> = {};
    const reasons: string[] = [];
    for (const rel of rels.rows) {
      const source = `${database}.${rel.ns}.${rel.name}`;
      const ownFields = fields.filter(f => f.tableID === rel.oid);
      if (rel.kind !== 'r' && rel.kind !== 'p') {
        reasons.push(`${rel.name} es una vista`);
        continue;
      }
      if (!rel.pk?.length) {
        reasons.push(`la tabla ${rel.name} no tiene clave primaria`);
        continue;
      }
      if (new Set(ownFields.map(f => f.columnID)).size !== ownFields.length) {
        reasons.push(`la tabla ${rel.name} aparece más de una vez en el resultado`);
        continue;
      }
      const indices = rel.pk.map(num => fields.findIndex(f => f.tableID === rel.oid && f.columnID === num));
      if (indices.some(i => i < 0)) {
        const pkNames = rel.pk.map(num => attName.get(`${rel.oid}:${num}`) ?? `#${num}`);
        reasons.push(`incluye la clave primaria de ${rel.name} (${pkNames.join(', ')}) en el SELECT para poder editarla`);
        continue;
      }
      tableKeys[source] = indices;
    }

    const columnMeta = fields.map((f): ResultColumnMeta => {
      const rel = f.tableID ? relById.get(f.tableID) : undefined;
      if (!rel) return { schema: null, namespace: null, table: null, column: null, source: null, editable: false };
      const source = `${database}.${rel.ns}.${rel.name}`;
      return {
        schema: database,
        namespace: rel.ns,
        table: rel.name,
        column: attName.get(`${rel.oid}:${f.columnID}`) ?? null,
        source,
        editable: Boolean(tableKeys[source]),
      };
    });

    const readOnlyReason = columnMeta.some(c => c.editable)
      ? null
      : `Solo lectura: ${reasons[0] ?? 'no se puede identificar cada fila'}`;
    return { columnMeta, tableKeys, readOnlyReason };
  }

  /**
   * UPDATE de una sola fila por su clave primaria completa. Tabla, columnas
   * y clave se validan contra el catálogo; los identificadores se escapan y
   * los valores van como parámetros `$n` (PostgreSQL infiere su tipo de la
   * columna). Sin `LIMIT` en PostgreSQL: con la clave primaria completa el
   * WHERE solo alcanza una fila.
   */
  async updateRow(t: ProbeTarget, input: UpdateRowInput): Promise<{ affectedRows: number }> {
    this.assertDatabaseAllowed(t, input.schema);
    const namespace = input.namespace || 'public';
    const changeCols = Object.keys(input.changes);
    if (changeCols.length === 0) throw new BadRequestException('No hay cambios que guardar');

    return this.withPg(t, input.schema, async (client) => {
      const rel = await client.query<{ oid: number; pk: number[] | null }>(
        `SELECT c.oid::int AS oid,
                (SELECT i.indkey::int2[] FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary) AS pk
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r', 'p')`,
        [namespace, input.table],
      );
      const table = rel.rows[0];
      if (!table) throw new BadRequestException(`La tabla ${namespace}.${input.table} no existe`);

      const atts = await client.query<{ num: number; name: string }>(
        `SELECT attnum::int AS num, attname AS name FROM pg_attribute
          WHERE attrelid = $1 AND attnum > 0 AND NOT attisdropped`,
        [table.oid],
      );
      const byNum = new Map(atts.rows.map(a => [a.num, a.name]));
      const existing = new Set(atts.rows.map(a => a.name));
      const pk = (table.pk ?? []).map(n => byNum.get(n)).filter((n): n is string => Boolean(n)).sort();
      const sentKey = Object.keys(input.key).sort();
      /* La clave tiene que ser exactamente la primaria: con otra cosa el
         WHERE podría alcanzar varias filas. */
      if (pk.length === 0 || pk.join('\u0000') !== sentKey.join('\u0000')) {
        throw new BadRequestException('Para editar hace falta la clave primaria completa de la fila');
      }
      const unknown = changeCols.filter(c => !existing.has(c));
      if (unknown.length) throw new BadRequestException(`Columnas desconocidas: ${unknown.join(', ')}`);

      const id = (name: string) => client.escapeIdentifier(name);
      const values = [...changeCols.map(c => input.changes[c]), ...pk.map(c => input.key[c])];
      const sql =
        `UPDATE ${id(namespace)}.${id(input.table)} SET ` +
        changeCols.map((c, i) => `${id(c)} = $${i + 1}`).join(', ') +
        ' WHERE ' + pk.map((c, i) => `${id(c)} IS NOT DISTINCT FROM $${changeCols.length + i + 1}`).join(' AND ');

      try {
        const res = await client.query(sql, values);
        if (!res.rowCount) {
          throw new BadRequestException('La fila ya no existe o cambió su clave: vuelve a ejecutar la consulta');
        }
        return { affectedRows: res.rowCount };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(describePgError(err));
      }
    });
  }

  /**
   * Columnas de una tabla para el formulario de fila nueva. `column_default`
   * es una expresión: un literal ('abc'::text, 0, true) se precarga; lo demás
   * (nextval, now(), gen_random_uuid()…) lo calcula la base.
   */
  async tableColumns(t: ProbeTarget, ref: TableRef): Promise<InsertColumn[]> {
    this.assertDatabaseAllowed(t, ref.schema);
    const namespace = ref.namespace || 'public';
    return this.withPg(t, ref.schema, async (client) => {
      const res = await client.query<{
        name: string; type: string; nullable: string; def: string | null; identity: string; generated: string; pk: boolean;
      }>(
        `SELECT c.column_name AS name,
                format_type(a.atttypid, a.atttypmod) AS type,
                c.is_nullable AS nullable, c.column_default AS def,
                c.is_identity AS identity, c.is_generated AS generated,
                EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS pk
           FROM information_schema.columns c
           JOIN pg_attribute a ON a.attrelid = format('%I.%I', c.table_schema, c.table_name)::regclass AND a.attname = c.column_name
          WHERE c.table_schema = $1 AND c.table_name = $2
          ORDER BY c.ordinal_position`,
        [namespace, ref.table],
      );
      if (res.rows.length === 0) throw new BadRequestException(`La tabla ${namespace}.${ref.table} no existe`);
      return res.rows.map((r): InsertColumn => {
        const raw = r.def;
        const literal = raw === null || /^NULL(::|$)/i.test(raw) ? null
          : unquoteDefault(raw) ?? (/^-?\d+(\.\d+)?(::[\w ]+)?$|^(true|false)$/i.test(raw) ? raw.replace(/::.*$/, '') : null);
        const expression = raw !== null && literal === null && !/^NULL(::|$)/i.test(raw) ? raw : null;
        const identity = r.identity === 'YES';
        return {
          name: r.name,
          type: r.type,
          nullable: r.nullable === 'YES',
          defaultValue: literal,
          auto: identity || expression !== null,
          autoLabel: identity ? 'identity' : expression,
          generated: r.generated === 'ALWAYS',
          primaryKey: r.pk,
        };
      });
    });
  }

  /** Inserta una fila con las columnas recibidas; las demás toman su valor por defecto. Devuelve la fila (RETURNING *). */
  async insertRow(t: ProbeTarget, input: InsertRowInput): Promise<InsertRowResult> {
    const columns = await this.tableColumns(t, input);
    const namespace = input.namespace || 'public';
    const cols = Object.keys(input.values);
    const known = new Map(columns.map(c => [c.name, c]));
    const unknown = cols.filter(c => !known.has(c));
    if (unknown.length) throw new BadRequestException(`Columnas desconocidas: ${unknown.join(', ')}`);
    const generated = cols.filter(c => known.get(c)?.generated);
    if (generated.length) throw new BadRequestException(`Columnas generadas, no se pueden escribir: ${generated.join(', ')}`);

    return this.withPg(t, input.schema, async (client) => {
      const id = (name: string) => client.escapeIdentifier(name);
      const target = `${id(namespace)}.${id(input.table)}`;
      const sql = cols.length
        ? `INSERT INTO ${target} (${cols.map(id).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`
        : `INSERT INTO ${target} DEFAULT VALUES RETURNING *`;
      try {
        const res = await client.query<Record<string, unknown>>(sql, cols.map(c => input.values[c]));
        const inserted = res.rows[0];
        return {
          affectedRows: res.rowCount ?? 0,
          insertId: null,
          row: inserted ? Object.fromEntries(Object.entries(inserted).map(([k, v]) => [k, serializeValue(v)])) : null,
        };
      } catch (err) {
        throw new BadRequestException(describePgError(err));
      }
    });
  }

  /** Borra filas por su clave primaria completa, en una transacción. */
  async deleteRows(t: ProbeTarget, input: DeleteRowsInput): Promise<{ affectedRows: number }> {
    this.assertDatabaseAllowed(t, input.schema);
    if (input.keys.length === 0) throw new BadRequestException('No hay filas que borrar');
    if (input.keys.length > MAX_DELETE_ROWS) throw new BadRequestException(`Se pueden borrar hasta ${MAX_DELETE_ROWS} filas de una vez`);
    const namespace = input.namespace || 'public';

    return this.withPg(t, input.schema, async (client) => {
      const rel = await client.query<{ pk: string[] | null }>(
        `SELECT ARRAY(SELECT a.attname::text FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
                       WHERE i.indrelid = c.oid AND i.indisprimary) AS pk
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r', 'p')`,
        [namespace, input.table],
      );
      if (!rel.rows[0]) throw new BadRequestException(`La tabla ${namespace}.${input.table} no existe`);
      /* ::text[]: con name[] el driver devuelve el texto «{id}» en vez de una lista. */
      const pk = rel.rows[0].pk ?? [];
      assertPrimaryKeys(pk, input.keys);
      const id = (name: string) => client.escapeIdentifier(name);
      const sql = `DELETE FROM ${id(namespace)}.${id(input.table)} WHERE ` +
        pk.map((c, i) => `${id(c)} IS NOT DISTINCT FROM $${i + 1}`).join(' AND ');

      let affected = 0;
      try {
        await client.query('BEGIN');
        for (const key of input.keys) {
          const res = await client.query(sql, pk.map(c => key[c]));
          affected += res.rowCount ?? 0;
        }
        await client.query('COMMIT');
        return { affectedRows: affected };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new BadRequestException(describePgError(err));
      }
    });
  }

  /* Una conexión apuntada a una base no da acceso a las demás desde el panel. */
  private assertDatabaseAllowed(t: ProbeTarget, database: string) {
    assertIdentifier(database, 'la base');
    if (t.database && t.database !== database) {
      throw new BadRequestException('Esta conexión solo da acceso a la base ' + t.database);
    }
  }

  /* Con sesión, su cliente para esa base (en serie con el resto de llamadas);
     sin ella, un cliente para esta llamada que se cierra al terminar. */
  private async withPg<T>(t: ProbeTarget, database: string | null, fn: (client: Client) => Promise<T>): Promise<T> {
    const db = database || t.database || 'postgres';
    const run = async (client: Client) => {
      try {
        return await fn(client);
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(describePgError(err));
      }
    };
    if (t.session) return t.session.pg(db, run);

    let client: Client;
    try {
      client = await openPg(t, db);
    } catch (err) {
      throw new BadRequestException(describePgError(err));
    }
    try {
      return await run(client);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

}

interface StreamedPgResult {
  fields: FieldDef[];
  /** Como mucho `maxRows` filas. */
  rows: unknown[][];
  /** Filas que devolvió el motor, guardadas o no. */
  received: number;
  /** Filas afectadas (INSERT/UPDATE/DELETE) según la etiqueta del motor. */
  rowCount: number | null;
}

/**
 * Ejecuta la sentencia recibiendo las filas una a una: con un listener de
 * `row`, pg no acumula el resultado, así que un SELECT enorme no llena la
 * memoria del backend. Se guardan las primeras `maxRows` y el resto se cuenta.
 * Protocolo extendido: una sola sentencia (ver la clase).
 */
export function streamPgQuery(client: Client, sql: string, maxRows: number): Promise<StreamedPgResult> {
  return new Promise<StreamedPgResult>((resolve, reject) => {
    const rows: unknown[][] = [];
    let received = 0;
    /* Con callback, que el cliente necesita para aplicar `query_timeout`. */
    const query = new Query(
      { text: sql, rowMode: 'array', queryMode: 'extended' } as QueryConfig,
      (err: Error | undefined, result: { fields?: FieldDef[]; rowCount?: number | null } | undefined) => {
        if (err) return reject(err);
        resolve({ fields: result?.fields ?? [], rows, received, rowCount: result?.rowCount ?? null });
      },
    );
    /* Con callback pg acumularía todas las filas en el resultado: se desactiva
       tras cada descripción de filas y se guardan aquí solo las primeras. */
    const internals = query as unknown as { handleRowDescription(msg: unknown): void; _accumulateRows: boolean };
    const describe = internals.handleRowDescription.bind(query) as (msg: unknown) => void;
    internals.handleRowDescription = (msg: unknown) => {
      describe(msg);
      internals._accumulateRows = false;
    };
    query.on('row', (row: unknown) => {
      received++;
      if (rows.length < maxRows) rows.push(row as unknown[]);
    });
    void client.query(query);
  });
}

/** Errores del driver y del servidor, en el idioma del panel. */
export function describePgError(err: unknown): string {
  const e = err as { code?: string; message?: string; detail?: string; hint?: string; position?: string };
  const code = e?.code ?? '';
  const msg = e?.message ?? String(err);

  if (code === 'ECONNREFUSED') return 'Conexión rechazada: el motor no escucha en ese host y puerto';
  if (code === 'ETIMEDOUT' || /timeout expired|Connection terminated due to connection timeout/i.test(msg)) return 'Tiempo de espera agotado';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'No se encontró el host';
  if (code === '28P01' || code === '28000') return 'Usuario o contraseña incorrectos';
  if (code === '3D000') return 'La base de datos no existe';
  /* 57014: cancelada por statement_timeout. */
  if (code === '57014' || /Query read timeout/i.test(msg)) return 'La consulta superó el tiempo máximo de 30 s';
  /* 42601 con varias sentencias en el protocolo extendido. */
  if (/cannot insert multiple commands into a prepared statement/i.test(msg)) {
    return 'Ejecuta una sentencia por vez: selecciona la que quieras y pulsa Ctrl + Enter';
  }

  const parts = [msg];
  if (e.position) parts[0] += ` (posición ${e.position})`;
  if (e.detail) parts.push(e.detail);
  if (e.hint) parts.push(`Sugerencia: ${e.hint}`);
  return parts.join('\n');
}
