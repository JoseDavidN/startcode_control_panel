import type { SchemaTable } from '@typings/database.types';
import { quoteIdent, type SqlDialect } from '@utils/sqlDialect';

/**
 * Predicción de tablas y columnas en el editor SQL.
 *
 * Todo es local y barato: el índice se arma una vez con las tablas que ya
 * trajo el árbol (misma caché de React Query, sin peticiones nuevas) y en
 * cada tecla solo se mira la sentencia donde está el cursor.
 */

export interface CompletionItem {
  label: string;
  /** Texto que se escribe (citado si hace falta). */
  insert: string;
  kind: 'table' | 'view' | 'column' | 'alias';
  /** Tipo de la columna o tabla de origen. */
  detail?: string;
}

export interface CompletionIndex {
  tables: SchemaTable[];
  /** Nombre en minúsculas → tablas con ese nombre (en PostgreSQL puede repetirse entre esquemas). */
  byName: Map<string, SchemaTable[]>;
  /** Esquemas de PostgreSQL (`public`…), para `x.` */
  namespaces: Set<string>;
}

export interface CompletionResult {
  items: CompletionItem[];
  /** Desde dónde se reemplaza al aceptar (inicio de la palabra a medias). */
  from: number;
  prefix: string;
}

const MAX_ITEMS = 50;
const IDENT = /[\w$]/;
const PLAIN_IDENT = /^[a-z_][a-z0-9_$]*$/;

/* Palabras que, justo antes, piden una tabla. */
const TABLE_CONTEXT = new Set(['from', 'join', 'into', 'update', 'table', 'describe', 'desc', 'truncate']);
/* Lo que puede seguir a una tabla y no es su alias. */
const NOT_ALIAS = new Set([
  'where', 'on', 'using', 'join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'natural', 'set', 'values',
  'group', 'order', 'limit', 'having', 'union', 'as', 'select', 'returning', 'offset', 'for', 'window', 'lateral',
]);

export function buildCompletionIndex(tables: SchemaTable[]): CompletionIndex {
  const byName = new Map<string, SchemaTable[]>();
  const namespaces = new Set<string>();
  for (const t of tables) {
    const key = t.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), t]);
    if (t.namespace) namespaces.add(t.namespace.toLowerCase());
  }
  return { tables, byName, namespaces };
}

const unquote = (s: string) => s.replace(/^[`"[]|[`"\]]$/g, '');

const ident = (dialect: SqlDialect, name: string) =>
  PLAIN_IDENT.test(name) || (dialect === 'mysql' && /^[a-z_][\w$]*$/i.test(name)) ? name : quoteIdent(dialect, name);

/** Sentencia donde está el cursor: entre el `;` anterior y el siguiente. */
function statementAround(text: string, caret: number) {
  const start = text.lastIndexOf(';', caret - 1) + 1;
  const endAt = text.indexOf(';', caret);
  return { start, text: text.slice(start, endAt === -1 ? text.length : endAt) };
}

/* ¿El cursor cae dentro de una cadena o un comentario? Escaneo lineal solo de la sentencia. */
function insideStringOrComment(s: string): boolean {
  let quote: string | null = null;
  let line = false;
  let block = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];
    if (line) { if (ch === '\n') line = false; continue; }
    if (block) { if (ch === '*' && next === '/') { block = false; i++; } continue; }
    if (quote) {
      if (ch === '\\' && quote !== '"') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'") quote = ch;
    else if ((ch === '-' && next === '-') || ch === '#') line = true;
    else if (ch === '/' && next === '*') { block = true; i++; }
  }
  return quote !== null || line || block;
}

/** Tablas que usa la sentencia (FROM, JOIN, UPDATE, INTO) con su alias. */
function referencedTables(stmt: string, index: CompletionIndex) {
  const refs: { table: SchemaTable; alias: string | null }[] = [];
  const re = /\b(?:from|join|update|into)\s+((?:[`"]?[\w$]+[`"]?\.)?[`"]?[\w$]+[`"]?)(?:\s+(?:as\s+)?([`"]?[\w$]+[`"]?))?/gi;
  for (const m of stmt.matchAll(re)) {
    const parts = m[1].split('.').map(unquote);
    const name = parts[parts.length - 1].toLowerCase();
    const ns = parts.length > 1 ? parts[0].toLowerCase() : null;
    const found = (index.byName.get(name) ?? []).filter(t => !ns || !t.namespace || t.namespace.toLowerCase() === ns);
    const alias = m[2] ? unquote(m[2]) : null;
    for (const t of found) refs.push({ table: t, alias: alias && !NOT_ALIAS.has(alias.toLowerCase()) ? alias : null });
  }
  return refs;
}

/* Fuera de `public`, PostgreSQL necesita el esquema delante (salvo que ya se escribió `esquema.`). */
const tableItem = (dialect: SqlDialect, t: SchemaTable, qualify = true): CompletionItem => ({
  label: t.name,
  insert: qualify && t.namespace && t.namespace !== 'public' ? `${ident(dialect, t.namespace)}.${ident(dialect, t.name)}` : ident(dialect, t.name),
  kind: t.type === 'view' ? 'view' : 'table',
  detail: t.namespace && t.namespace !== 'public' ? t.namespace : t.type === 'view' ? 'vista' : 'tabla',
});

const columnItems = (dialect: SqlDialect, tables: SchemaTable[]): CompletionItem[] => {
  const seen = new Set<string>();
  const out: CompletionItem[] = [];
  for (const t of tables) {
    for (const c of t.columns) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      out.push({ label: c.name, insert: ident(dialect, c.name), kind: 'column', detail: tables.length > 1 ? `${t.name} · ${c.type}` : c.type });
    }
  }
  return out;
};

/* Primero los que empiezan por lo escrito, luego los que lo contienen. */
function rank(items: CompletionItem[], prefix: string): CompletionItem[] {
  if (!prefix) return items.slice(0, MAX_ITEMS);
  const p = prefix.toLowerCase();
  const starts: CompletionItem[] = [];
  const contains: CompletionItem[] = [];
  for (const it of items) {
    const l = it.label.toLowerCase();
    if (l === p) continue;
    if (l.startsWith(p)) starts.push(it);
    else if (l.includes(p)) contains.push(it);
    if (starts.length >= MAX_ITEMS) break;
  }
  return [...starts, ...contains].slice(0, MAX_ITEMS);
}

/**
 * Sugerencias para el cursor en `caret`. `force` (Ctrl + Espacio) las muestra
 * aunque no haya nada escrito todavía.
 */
export function completeSql(text: string, caret: number, index: CompletionIndex, dialect: SqlDialect, force = false): CompletionResult | null {
  let from = caret;
  while (from > 0 && IDENT.test(text[from - 1])) from--;
  const prefix = text.slice(from, caret);
  /* Justo después de un número (`LIMIT 10`) no se sugiere nada. */
  if (/^\d/.test(prefix)) return null;

  const stmt = statementAround(text, caret);
  const before = text.slice(stmt.start, from);
  if (insideStringOrComment(before)) return null;

  /* `x.` → columnas de la tabla o alias x, o tablas del esquema x. */
  const dot = /([`"]?[\w$]+[`"]?)\.$/.exec(before);
  if (dot) {
    const q = unquote(dot[1]).toLowerCase();
    const refs = referencedTables(stmt.text, index);
    const byAlias = refs.filter(r => r.alias?.toLowerCase() === q).map(r => r.table);
    const tables = byAlias.length ? byAlias : (index.byName.get(q) ?? []);
    if (tables.length) return { items: rank(columnItems(dialect, tables), prefix), from, prefix };
    if (index.namespaces.has(q)) {
      return { items: rank(index.tables.filter(t => t.namespace?.toLowerCase() === q).map(t => tableItem(dialect, t, false)), prefix), from, prefix };
    }
    return null;
  }

  if (!prefix && !force) return null;

  const prevWord = /([a-z_]+)\s*$/i.exec(before)?.[1]?.toLowerCase();
  const tables = index.tables.map(t => tableItem(dialect, t));
  if (prevWord && TABLE_CONTEXT.has(prevWord)) return { items: rank(tables, prefix), from, prefix };

  /* En el resto: columnas de las tablas que usa la sentencia y después las tablas. */
  const refs = referencedTables(stmt.text, index);
  const aliases: CompletionItem[] = refs.filter(r => r.alias).map(r => ({ label: r.alias!, insert: r.alias!, kind: 'alias', detail: `alias de ${r.table.name}` }));
  const items = [...columnItems(dialect, refs.map(r => r.table)), ...aliases, ...tables];
  const result = rank(items, prefix);
  return result.length ? { items: result, from, prefix } : null;
}
