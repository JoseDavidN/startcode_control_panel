/* Valores fijos de los servidores, compartidos por los modales y la lista. */

export const SERVER_OS_OPTIONS = [
  { value: 'ubuntu',  label: 'Ubuntu' },
  { value: 'centos',  label: 'CentOS' },
  { value: 'debian',  label: 'Debian' },
  { value: 'fedora',  label: 'Fedora' },
  { value: 'arch',    label: 'Arch Linux' },
  { value: 'solaris', label: 'Solaris' },
  { value: 'openbsd', label: 'OpenBSD' },
  { value: 'netbsd',  label: 'NetBSD' },
  { value: 'freebsd', label: 'FreeBSD' },
  { value: 'other',   label: 'Otro' },
];

export const osLabel = (os: string): string => SERVER_OS_OPTIONS.find(o => o.value === os)?.label ?? os;

/* ── Llave privada SSH ────────────────────────────────────────────── */

/** Saltos de línea de Windows o Mac clásico a `\n`, sin espacios en los extremos. */
export const normalizeKey = (value: string): string =>
  value.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

/** Comprobación de formato antes de enviarla (al dar de alta un servidor o al cambiarle la llave). */
export const validateKey = (key: string): { valid: boolean; error?: string } => {
  const k = key.trim();
  if (!k) return { valid: false, error: 'La clave privada es requerida' };
  if (!k.includes('BEGIN') || !k.includes('PRIVATE KEY'))
    return { valid: false, error: 'Debe contener "BEGIN ... PRIVATE KEY"' };
  if (!/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(k))
    return { valid: false, error: 'Debe comenzar con "-----BEGIN ... PRIVATE KEY-----"' };
  if (!/-----END [A-Z ]+PRIVATE KEY-----/.test(k))
    return { valid: false, error: 'Debe terminar con "-----END ... PRIVATE KEY-----"' };
  if ((k.includes('BEGIN RSA PRIVATE KEY') || k.includes('BEGIN EC PRIVATE KEY')) && k.includes('ENCRYPTED'))
    return { valid: false, error: 'La clave tiene passphrase. Remuévela con: ssh-keygen -p -N "" -f tu_clave' };
  const minLength = k.includes('BEGIN OPENSSH PRIVATE KEY') ? 400 : 800;
  if (k.length < minLength) return { valid: false, error: 'La clave parece estar incompleta' };
  return { valid: true };
};
