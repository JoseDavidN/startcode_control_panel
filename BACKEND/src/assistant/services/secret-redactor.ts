/**
 * Quita secretos de un texto antes de mandarlo a un proveedor de IA.
 *
 * Lo que adjunta el cliente (salida de la terminal, resultados de comandos o
 * de consultas) puede llevar una llave privada impresa con `cat`, una
 * contraseña en una cadena de conexión o un `IDENTIFIED BY`. Nada de eso
 * debe salir del panel: el asistente no puede leer llaves SSH ni contraseñas.
 */
const REDACTED = '[OCULTO]';

const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  /* Bloques PEM/OpenSSH de clave privada, completos o cortados. */
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g, `[LLAVE PRIVADA ${REDACTED}]`],
  [/PuTTY-User-Key-File-\d+:[\s\S]*?Private-MAC:\s*\S+/g, `[LLAVE PRIVADA ${REDACTED}]`],
  /* usuario:contraseña@host en URIs (postgres://, mysql://, redis://…). */
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*):[^\s@/]+@/gi, (_m, pre) => `${pre}:${REDACTED}@`],
  /* SQL: IDENTIFIED BY 'x', PASSWORD 'x', SET PASSWORD = 'x'. */
  [/\b(IDENTIFIED\s+(?:WITH\s+\w+\s+)?BY|PASSWORD)(\s*(?:=\s*)?)(['"]).*?\3/gi, (_m, kw, sep) => `${kw}${sep}'${REDACTED}'`],
  /* Variables y opciones con nombre de secreto: PGPASSWORD=x, --password=x, api_key: x. */
  [
    /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_]*)(\s*[=:]\s*)(["']?)[^\s"']+\3/gi,
    (_m, k, sep) => `${k}${sep}${REDACTED}`,
  ],
  [/(--password(?:=|\s+))(\S+)/gi, (_m, k) => `${k}${REDACTED}`],
  /* mysql -pSECRETO (sin espacio). */
  [/(\bmysql(?:dump|admin)?\b[^\n]*?\s-p)(?!\s)(\S+)/gi, (_m, k) => `${k}${REDACTED}`],
  /* sshpass -p x */
  [/(\bsshpass\s+-p\s*)(\S+)/gi, (_m, k) => `${k}${REDACTED}`],
  /* Claves de API con prefijo conocido. */
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, REDACTED],
  /* Hashes de contraseña de /etc/shadow o bcrypt. */
  [/\$(?:2[aby]|1|5|6|y)\$[^\s:]{20,}/g, REDACTED],
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const [re, rep] of RULES) {
    out = out.replace(re, rep as never);
  }
  return out;
}

/** Nombres de campo que nunca se envían, ni siquiera vacíos. */
const SENSITIVE_KEY = /pass(word|wd)?|pwd|secret|token|private.?key|api.?key|credential|hash|_enc$|enc$/i;

/** Copia profunda sin las propiedades con nombre de secreto. */
export function stripSensitiveKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripSensitiveKeys) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = stripSensitiveKeys(v);
    }
    return out as T;
  }
  return value;
}
