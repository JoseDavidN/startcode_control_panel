import { isIP } from 'net';
import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * Hosts y puertos de las conexiones (SSH y bases de datos).
 *
 * Se aceptan IPv4, IPv6 (sin corchetes) y nombres DNS según RFC 1123: así
 * nada con espacios, barras, `@` o caracteres de control llega a ssh2, a los
 * drivers ni a un mensaje de error, y un valor raro guardado antes de esta
 * validación no tumba el proceso al conectar.
 */
const LABEL = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9])?$/;

export function isValidHost(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const host = value.trim();
  if (!host || host.length > 253 || host !== value) return false;
  if (isIP(host)) return true;
  /* Lo que parece una IPv4 pero no lo es (999.1.1.1) no se toma por nombre. */
  if (/^[\d.]+$/.test(host)) return false;
  const name = host.endsWith('.') ? host.slice(0, -1) : host;
  return name.split('.').every(label => LABEL.test(label));
}

export function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** Decorador de class-validator para `host`. */
export function IsHost(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isHost',
      validator: {
        validate: (value: unknown) => isValidHost(value),
        defaultMessage: () => 'El host debe ser una IP o un nombre de dominio válido',
      },
    },
    options,
  );
}

/**
 * Usuario SSH: sin espacios, `:` ni caracteres de control, y sin guion
 * inicial (se leería como opción). Admite `usuario@dominio` y `DOMINIO\usuario`.
 */
export const SSH_USERNAME = /^[A-Za-z0-9_.\\@$][A-Za-z0-9_.\\@$-]{0,63}$/;
