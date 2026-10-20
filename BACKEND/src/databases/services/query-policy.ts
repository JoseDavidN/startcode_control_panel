/**
 * Sentencias SQL que piden confirmación explícita antes de ejecutarse desde
 * el editor. No se bloquean (el usuario puede tener motivos), pero no deben
 * salir de un Ctrl + Enter accidental, y las que se ejecutan quedan auditadas.
 */

export type SqlDialect = 'mysql' | 'postgresql';

export interface DangerousQuery {
  /** Completa la frase «Esta consulta …». */
  reason: string;
}

const RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /^drop\s+(database|schema)\b/, reason: 'elimina una base de datos completa' },
  { pattern: /^drop\s+(temporary\s+)?table\b/, reason: 'elimina una tabla y todos sus datos' },
  { pattern: /^drop\s+(user|role|owned)\b/, reason: 'elimina usuarios o roles del motor' },
  /* Cualquier otro DROP: vista, índice, función, secuencia, tipo, extensión… */
  { pattern: /^drop\b/, reason: 'elimina un objeto de la base de datos' },
  { pattern: /^truncate\b/, reason: 'vacía una tabla por completo' },
  { pattern: /^alter\s+table\b[\s\S]*\bdrop\b/, reason: 'elimina columnas, índices o restricciones de una tabla' },
  { pattern: /^rename\s+table\b|^alter\s+table\b[\s\S]*\brename\b/, reason: 'renombra tablas o columnas' },
  { pattern: /^(grant|revoke)\b/, reason: 'cambia permisos de usuarios' },
  { pattern: /^(create|alter|rename)\s+(user|role)\b|^set\s+password\b|^reassign\s+owned\b/, reason: 'crea o modifica usuarios o roles del motor' },
  { pattern: /^(shutdown|kill)\b/, reason: 'detiene el servidor o corta conexiones' },
  { pattern: /^load\s+data\b|\binto\s+(out|dump)file\b/, reason: 'lee o escribe archivos en el servidor de base de datos' },
  /* PostgreSQL: COPY a/desde un archivo del servidor o un programa (STDIN/STDOUT no). */
  { pattern: /^copy\b[\s\S]*\b(to|from)\s+(program\b|'')/, reason: 'lee o escribe archivos o ejecuta programas en el servidor de base de datos' },
  { pattern: /\bpg_(terminate|cancel)_backend\s*\(/, reason: 'corta conexiones de otros usuarios' },
  /* SQL que no se puede revisar antes de ejecutarlo: un bloque anónimo de PostgreSQL
     o una sentencia preparada (en MySQL su texto va en una cadena; luego basta un EXECUTE). */
  { pattern: /^do\b/, reason: 'ejecuta un bloque de código que no se puede revisar antes' },
  { pattern: /^prepare\b/, reason: 'prepara una sentencia dinámica que no se puede revisar antes' },
];

/**
 * Quita comentarios y el contenido de cadenas e identificadores entre
 * comillas, y normaliza espacios: así `'drop table'` dentro de un texto o
 * un `-- DELETE` comentado no cuentan, y `where` dentro de un string tampoco.
 * En PostgreSQL `#` es un operador, no un comentario, y existen las cadenas
 * con dólar (`$$…$$`, `$tag$…$tag$`).
 */
export function stripSql(sql: string, dialect: SqlDialect = 'mysql'): string {
  const lineComment = dialect === 'postgresql' ? /--[^\n]*/g : /(--|#)[^\n]*/g;
  return sql
    /* MySQL y MariaDB EJECUTAN lo que va en `/*! … *\/` y `/*M! … *\/` (así escribe
       mysqldump): no es un comentario y su contenido cuenta como SQL. */
    .replace(dialect === 'mysql' ? /\/\*M?!\d*([\s\S]*?)(\*\/|$)/g : /(?!)/g, ' $1 ')
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ')
    .replace(dialect === 'postgresql' ? /\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?(\$\1\$|$)/g : /(?!)/g, "''")
    .replace(lineComment, ' ')
    .replace(/'(?:\\.|''|[^'\\])*'?/g, "''")
    .replace(/"(?:\\.|""|[^"\\])*"?/g, '""')
    .replace(/`(?:``|[^`])*`?/g, '``')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* Sentencias que solo leen. `select … into` crea tablas (PostgreSQL) o escribe variables y archivos (MySQL). */
const READ_ONLY_START = /^(select|with|show|describe|desc|explain|values|table)\b/;
/* Dentro de una lectura solo escriben los CTE de modificación (PostgreSQL) y `into`. `for update` solo bloquea. */
const WRITES = /\b(insert|update|delete|merge|into)\b/;

/**
 * Exportar vuelve a ejecutar la consulta para traer todas las filas: solo se
 * permite con las que no cambian nada, para no repetir un INSERT o un UPDATE.
 */
export function isReadOnlyQuery(sql: string, dialect: SqlDialect = 'mysql'): boolean {
  const s = stripSql(sql, dialect).replace(/;\s*$/, '');
  if (!READ_ONLY_START.test(s)) return false;
  /* `explain analyze` ejecuta la sentencia de verdad. */
  if (/^explain\b/.test(s) && /\banalyze\b/.test(s)) return false;
  return !WRITES.test(s.replace(/^(show|describe|desc)\b.*/, '').replace(/\bfor (no key )?update\b/g, ''));
}

export function findDangerousQuery(sql: string, dialect: SqlDialect = 'mysql'): DangerousQuery | null {
  const s = stripSql(sql, dialect).replace(/;\s*$/, '');
  if (!s) return null;

  const rule = RULES.find(r => r.pattern.test(s));
  if (rule) return { reason: rule.reason };

  /* Sin WHERE afecta a todas las filas (un LIMIT no lo hace menos peligroso). */
  if (/^delete\b/.test(s) && !/\bwhere\b/.test(s)) return { reason: 'borra todas las filas de la tabla' };
  if (/^update\b/.test(s) && !/\bwhere\b/.test(s)) return { reason: 'modifica todas las filas de la tabla' };
  /* PostgreSQL admite DELETE/UPDATE dentro de un WITH (`WITH x AS (DELETE …) SELECT …`). */
  if (/^with\b/.test(s) && /\b(delete\s+from|update)\b/.test(s) && !/\bwhere\b/.test(s)) {
    return { reason: 'borra o modifica filas sin WHERE' };
  }

  return null;
}
