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
