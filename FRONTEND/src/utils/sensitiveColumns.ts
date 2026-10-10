/**
 * Columnas sensibles en los resultados del editor SQL: se reconocen por el
 * nombre y se muestran enmascaradas hasta que el usuario las revela.
 *
 * Es una protección de pantalla (que no se lean por encima del hombro ni
 * acaben en una captura), no de transporte: el backend envía los valores.
 */

export type SensitiveKind = 'secret' | 'email';

/* Diccionario. `words` se busca como palabra completa dentro del nombre
   (separado por `_`, `-`, `.`, espacios o cambio de mayúscula), así `pass`
   marca `user_pass` pero no `passenger`. `fragments` se busca en cualquier
   parte: son lo bastante largos para no dar falsos positivos. */
const DICTIONARY: Record<SensitiveKind, { words: string[]; fragments: string[] }> = {
  secret: {
    words: [
      'pass', 'pwd', 'pw', 'psw', 'passw', 'pin', 'otp', 'hash', 'salt', 'secret', 'token',
      'clave', 'apikey', 'cvv', 'cvc', 'nip',
    ],
    fragments: [
      'password', 'passwd', 'passphrase', 'contrasena', 'contrasenia', 'secreto',
      'apikey', 'api_key', 'access_key', 'secret_key', 'private_key', 'privatekey',
      'client_secret', 'refresh_token', 'access_token', 'auth_token', 'session_token',
      'credential', 'credencial', 'pwdhash', 'password_hash', 'totp', 'mfa_secret',
    ],
  },
  email: {
    words: ['mail', 'correo', 'email', 'emails'],
    fragments: ['email', 'e_mail', 'correo_electronico', 'correoelectronico', 'mail_address', 'emailaddress'],
  },
};

/** `UserPassword`, `user-password`, `Contraseña` → `user_password`, `contrasena`. */
function normalize(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Tipo de dato sensible que sugiere el nombre de la columna, o null. */
export function sensitiveKind(column: string): SensitiveKind | null {
  const norm = normalize(column);
  const words = new Set(norm.split('_'));
  const compact = norm.replace(/_/g, '');
  /* Secreto antes que correo: `email_password` es una contraseña. */
  for (const kind of ['secret', 'email'] as const) {
    const { words: w, fragments } = DICTIONARY[kind];
    if (w.some(x => words.has(x))) return kind;
    if (fragments.some(f => norm.includes(f) || compact.includes(f.replace(/_/g, '')))) return kind;
  }
  return null;
}

const DOTS = '••••••••';

/**
 * Valor enmascarado. Los secretos se tapan enteros y con largo fijo (el largo
 * real también es información). Los correos conservan la primera letra y el
 * dominio de primer nivel para poder distinguir filas: `j•••@g•••.com`.
 */
export function maskValue(kind: SensitiveKind, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (kind === 'email') {
    const text = String(value as string);
    const m = /^([^@\s])[^@\s]*@([^@\s])[^@\s]*?(\.[a-z0-9-]+)?$/i.exec(text.trim());
    if (m) return `${m[1]}•••@${m[2]}•••${m[3] ?? ''}`;
  }
  return DOTS;
}
