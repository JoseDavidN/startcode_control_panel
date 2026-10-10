import type { SqlDialect } from '@utils/sqlDialect';

/* Palabras reservadas que el editor SQL pasa a mayúsculas al escribirlas.
   Solo reservadas y funciones de agregado: palabras que suelen ser nombres de
   columna (`status`, `name`, `date`, `type`, `user`…) se dejan como estén. */
const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'between', 'exists',
  'join', 'inner', 'left', 'right', 'outer', 'cross', 'natural', 'on', 'using', 'as',
  'order', 'group', 'by', 'having', 'limit', 'offset', 'asc', 'desc', 'distinct',
  'union', 'all', 'case', 'when', 'then', 'else', 'end', 'with', 'recursive',
  'insert', 'into', 'values', 'update', 'set', 'delete', 'replace', 'ignore', 'duplicate',
  'create', 'alter', 'drop', 'truncate', 'rename', 'table', 'database', 'schema', 'view', 'index',
  'add', 'column', 'modify', 'change', 'primary', 'foreign', 'key', 'references', 'unique',
  'default', 'constraint', 'check', 'auto_increment', 'if', 'cascade',
  'show', 'databases', 'tables', 'columns', 'describe', 'explain', 'use',
  'begin', 'commit', 'rollback', 'transaction',
  'true', 'false', 'count', 'sum', 'avg', 'min', 'max',
  /* PostgreSQL */
  'ilike', 'returning', 'lateral', 'conflict',
]);

/** Caracteres que cierran una palabra y disparan el paso a mayúsculas. */
const BOUNDARY = /[\s(),;]/;
const WORD_CHAR = /[A-Za-z_]/;

/**
 * Si justo antes de `pos` se acaba de cerrar una palabra reservada, la
 * devuelve en mayúsculas. Fuera de cadenas, identificadores entre comillas
 * invertidas y comentarios. Devuelve el mismo texto si no hay nada que cambiar;
 * la longitud no varía, así que el cursor queda donde estaba.
 */
export function uppercaseKeywordBefore(text: string, pos: number, dialect: SqlDialect = 'mysql'): string {
  if (pos < 2 || !BOUNDARY.test(text[pos - 1])) return text;

  let start = pos - 1;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  const word = text.slice(start, pos - 1);
  /* Parte de un identificador más largo (`tbl.from`, `x1select`): no se toca. */
  if (!word || (start > 0 && /[\w.$`]/.test(text[start - 1]))) return text;
  if (!SQL_KEYWORDS.has(word.toLowerCase()) || word === word.toUpperCase()) return text;
  if (isInsideLiteral(text, start, dialect)) return text;

  return text.slice(0, start) + word.toUpperCase() + text.slice(pos - 1);
}

/**
 * Recorre el texto hasta `pos` para saber si cae en cadena, identificador
 * citado o comentario. En PostgreSQL `#` no comenta y existen las cadenas
 * con dólar (`$$…$$`, `$tag$…$tag$`).
 */
function isInsideLiteral(text: string, pos: number, dialect: SqlDialect): boolean {
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  const pg = dialect === 'postgresql';

  for (let i = 0; i < pos; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (quote.length > 1) {
        if (text.startsWith(quote, i)) { i += quote.length - 1; quote = null; }
        continue;
      }
      if (c === '\\' && quote !== '`' && !pg) { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    const dollar = pg && c === '$' ? /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i)) : null;
    if (dollar) { quote = dollar[0]; i += dollar[0].length - 1; }
    else if (c === "'" || c === '"' || (c === '`' && !pg)) quote = c;
    else if ((c === '#' && !pg) || (c === '-' && next === '-')) lineComment = true;
    else if (c === '/' && next === '*') { blockComment = true; i++; }
  }
  return quote !== null || lineComment || blockComment;
}

/* ── Resaltado ─────────────────────────────────────────────────────── */

export type SqlTokenType =
  | 'keyword' | 'function' | 'type' | 'string' | 'number'
  | 'identifier' | 'comment' | 'operator' | 'text';

export interface SqlToken {
  type: SqlTokenType;
  text: string;
}

/* Solo se pintan: no pasan a mayúsculas porque también son nombres
   habituales de columna o se escriben de muchas formas. */
const HIGHLIGHT_ONLY_KEYWORDS = new Set([
  'interval', 'regexp', 'rlike', 'escape', 'xor', 'div', 'mod', 'unsigned', 'zerofill',
  'engine', 'charset', 'collate', 'character', 'after', 'first', 'returning', 'over', 'partition',
  'window', 'procedure', 'function', 'trigger', 'declare', 'return', 'returns', 'call', 'grant',
  'revoke', 'privileges', 'to', 'of', 'for', 'lock', 'unlock', 'read', 'write', 'start',
  /* PostgreSQL */
  'similar', 'only', 'materialized', 'concurrently', 'nulls', 'vacuum', 'analyze', 'extension',
  'sequence', 'role', 'owner', 'language', 'do', 'nothing', 'excluded', 'filter', 'perform',
]);

const SQL_TYPES = new Set([
  'int', 'integer', 'tinyint', 'smallint', 'mediumint', 'bigint', 'decimal', 'numeric', 'float',
  'double', 'real', 'bit', 'bool', 'boolean', 'char', 'varchar', 'binary', 'varbinary', 'text',
  'tinytext', 'mediumtext', 'longtext', 'blob', 'tinyblob', 'mediumblob', 'longblob', 'enum',
  'json', 'date', 'datetime', 'timestamp', 'time', 'year', 'uuid', 'serial',
  /* PostgreSQL */
  'jsonb', 'timestamptz', 'timetz', 'bigserial', 'smallserial', 'bytea', 'inet', 'cidr', 'macaddr',
  'interval', 'money', 'citext', 'tsvector', 'xml', 'int2', 'int4', 'int8', 'float4', 'float8', 'oid', 'regclass',
]);

/** Reservadas que, seguidas de `(`, son funciones. */
const CALLABLE_KEYWORDS = new Set(['count', 'sum', 'avg', 'min', 'max', 'if', 'replace', 'left', 'right', 'insert']);

/* MySQL: comentarios con `--` y `#`, cadenas con '…' y "…", identificadores
   con `…`. PostgreSQL: `#` es un operador, "…" es un identificador, y hay
   cadenas con dólar ($$…$$) y el operador de conversión `::`. */
const TOKEN_RE: Record<SqlDialect, RegExp> = {
  mysql: new RegExp(
    [
      String.raw`(?<comment>--[^\n]*|#[^\n]*|\/\*[\s\S]*?(?:\*\/|$))`,
      String.raw`(?<string>'(?:\\.|''|[^'\\])*(?:'|$)|"(?:\\.|""|[^"\\])*(?:"|$))`,
      String.raw`(?<identifier>\x60(?:\x60\x60|[^\x60])*(?:\x60|$))`,
      String.raw`(?<number>\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b0x[0-9a-f]+\b)`,
      String.raw`(?<word>[A-Za-z_][\w$]*)`,
      String.raw`(?<operator>[=<>!]=?|<>|[-+*/%,;().]|\|\||&&)`,
    ].join('|'),
    'gi',
  ),
  postgresql: new RegExp(
    [
      String.raw`(?<comment>--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))`,
      String.raw`(?<string>(?:[eE])?'(?:\\.|''|[^'\\])*(?:'|$)|\$(?<tag>[A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?(?:\$\k<tag>\$|$))`,
      String.raw`(?<identifier>"(?:""|[^"])*(?:"|$))`,
      String.raw`(?<number>\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)`,
      String.raw`(?<word>[A-Za-z_][\w$]*)`,
      String.raw`(?<operator>::|[=<>!]=?|<>|->>?|[-+*/%,;().#~|&^@]|\|\|)`,
    ].join('|'),
    'gi',
  ),
};

/**
 * Divide el SQL en tokens para pintarlo. Concatenar sus `text` devuelve el
 * texto original exacto: el resaltado va debajo del textarea y cada carácter
 * tiene que caer en el mismo sitio.
 */
export function tokenizeSql(text: string, dialect: SqlDialect = 'mysql'): SqlToken[] {
  const tokens: SqlToken[] = [];
  let last = 0;

  for (const m of text.matchAll(TOKEN_RE[dialect])) {
    const index = m.index;
    if (index > last) tokens.push({ type: 'text', text: text.slice(last, index) });
    const g = m.groups ?? {};
    const value = m[0];

    let type: SqlTokenType = 'text';
    if (g.comment) type = 'comment';
    else if (g.string) type = 'string';
    else if (g.identifier) type = 'identifier';
    else if (g.number) type = 'number';
    else if (g.operator) type = 'operator';
    else if (g.word) {
      const lower = value.toLowerCase();
      /* Detrás de un punto es un nombre (`tbl.from`, `db.date`). */
      const afterDot = index > 0 && text[index - 1] === '.';
      const call = text[index + value.length] === '(';
      if (afterDot) type = 'text';
      /* `INT(11)` es un tipo; `COUNT(`, `IF(` o `NOW(` son llamadas. */
      else if (SQL_TYPES.has(lower)) type = 'type';
      else if (call && (!SQL_KEYWORDS.has(lower) || CALLABLE_KEYWORDS.has(lower))) type = 'function';
      else if (SQL_KEYWORDS.has(lower) || HIGHLIGHT_ONLY_KEYWORDS.has(lower)) type = 'keyword';
    }

    tokens.push({ type, text: value });
    last = index + value.length;
  }
  if (last < text.length) tokens.push({ type: 'text', text: text.slice(last) });
  return tokens;
}
