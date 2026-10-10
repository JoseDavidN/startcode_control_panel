import type {
  DatabaseEngine,
  SchemaIndex,
  SchemaProcedure,
  SchemaTrigger,
} from '@typings/database.types';

/**
 * Diferencias de SQL entre motores que la vista de gestión necesita: cómo se
 * citan los identificadores y con qué sentencia se consulta cada objeto del
 * árbol al hacerle doble clic.
 */
export type SqlDialect = 'mysql' | 'postgresql';

export const engineDialect = (engine: DatabaseEngine): SqlDialect =>
  engine === 'postgresql' ? 'postgresql' : 'mysql';

/** Identificador citado: `nombre` en MySQL, "nombre" en PostgreSQL. */
export const quoteIdent = (dialect: SqlDialect, name: string): string =>
  dialect === 'postgresql' ? `"${name.replace(/"/g, '""')}"` : `\`${name.replace(/`/g, '``')}\``;

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** Nombre a mostrar: en PostgreSQL, con su esquema salvo que sea `public`. */
export const displayName = (name: string, namespace?: string): string =>
  namespace && namespace !== 'public' ? `${namespace}.${name}` : name;

const qualified = (dialect: SqlDialect, name: string, namespace?: string) =>
  dialect === 'postgresql' && namespace
    ? `${quoteIdent(dialect, namespace)}.${quoteIdent(dialect, name)}`
    : quoteIdent(dialect, name);

export const selectTableSql = (dialect: SqlDialect, name: string, namespace?: string) =>
  `SELECT * FROM ${qualified(dialect, name, namespace)} LIMIT 100;`;

export const triggerSql = (dialect: SqlDialect, t: SchemaTrigger) =>
  dialect === 'postgresql'
    ? `SELECT pg_get_triggerdef(tg.oid, true) AS definicion\n  FROM pg_trigger tg\n  JOIN pg_class c ON c.oid = tg.tgrelid\n  JOIN pg_namespace n ON n.oid = c.relnamespace\n WHERE tg.tgname = ${literal(t.name)} AND c.relname = ${literal(t.table)} AND n.nspname = ${literal(t.namespace ?? 'public')};`
    : `SHOW CREATE TRIGGER ${quoteIdent(dialect, t.name)};`;

export const indexSql = (dialect: SqlDialect, ix: SchemaIndex) =>
  dialect === 'postgresql'
    ? `SELECT indexname, indexdef\n  FROM pg_indexes\n WHERE schemaname = ${literal(ix.namespace ?? 'public')} AND tablename = ${literal(ix.table)};`
    : `SHOW INDEX FROM ${quoteIdent(dialect, ix.table)};`;

export const procedureSql = (dialect: SqlDialect, p: SchemaProcedure) =>
  dialect === 'postgresql'
    ? `SELECT pg_get_functiondef(p.oid) AS definicion\n  FROM pg_proc p\n  JOIN pg_namespace n ON n.oid = p.pronamespace\n WHERE p.proname = ${literal(p.name)} AND n.nspname = ${literal(p.namespace ?? 'public')};`
    : `SHOW CREATE PROCEDURE ${quoteIdent(dialect, p.name)};`;
