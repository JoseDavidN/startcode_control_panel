import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';

/**
 * Verificación de la clave de host SSH.
 *
 * Cada servidor guarda el algoritmo y la huella `SHA256:<base64>` (la misma
 * que enseña OpenSSH) de la clave que el usuario confirmó: al darlo de alta
 * (escaneo previo) o en el aviso de la primera conexión. Sin huella confirmada
 * no se autentica nunca, y una clave distinta de la guardada corta la conexión
 * antes de autenticarse: la llave privada del panel nunca firma para un host
 * que nadie ha comprobado.
 */

export interface HostKey {
  /** Tipo de la clave (`ssh-ed25519`, `ssh-rsa`, `ecdsa-sha2-nistp256`…). */
  algorithm: string;
  /** `SHA256:<base64 sin relleno>`, como `ssh-keygen -lf`. */
  fingerprint: string;
}

export const HOST_KEY_MISMATCH = 'HOST_KEY_MISMATCH';
/** El servidor aún no tiene huella confirmada: hay que enseñarla y aceptarla. */
export const HOST_KEY_UNVERIFIED = 'HOST_KEY_UNVERIFIED';

/** Formato de una huella SHA256 de OpenSSH: 32 bytes en base64 sin `=`. */
export const HOST_KEY_FINGERPRINT = /^SHA256:[A-Za-z0-9+/]{43}$/;

/** Primer campo del blob de la clave pública (formato SSH: uint32 + cadena). */
export function hostKeyAlgorithm(blob: Buffer): string {
  if (blob.length < 4) return 'unknown';
  const len = blob.readUInt32BE(0);
  if (len < 1 || len > 64 || 4 + len > blob.length) return 'unknown';
  const name = blob.subarray(4, 4 + len).toString('latin1');
  return /^[\x21-\x7e]+$/.test(name) ? name : 'unknown';
}

export function hostKeyFingerprint(blob: Buffer): string {
  const digest = createHash('sha256').update(blob).digest('base64');
  return `SHA256:${digest.replace(/=+$/, '')}`;
}

export function describeHostKey(blob: Buffer): HostKey {
  return { algorithm: hostKeyAlgorithm(blob), fingerprint: hostKeyFingerprint(blob) };
}

export type HostKeyCheck = 'first-use' | 'match' | 'mismatch';

/** La huella cubre el blob entero (algoritmo incluido): basta con compararla. */
export function checkHostKey(pinned: string | null | undefined, received: HostKey): HostKeyCheck {
  if (!pinned) return 'first-use';
  return pinned === received.fingerprint ? 'match' : 'mismatch';
}

export interface HostKeyMismatchDetails {
  serverId: string;
  host: string;
  port: number;
  expected: { algorithm: string | null; fingerprint: string };
  received: HostKey;
}

export type HostKeyUnverifiedDetails = Omit<HostKeyMismatchDetails, 'expected'> & { expected: null };

/** Base de los dos rechazos: los servicios que los dejan pasar comprueban esta. */
export abstract class HostKeyError extends ConflictException {
  abstract readonly code: typeof HOST_KEY_MISMATCH | typeof HOST_KEY_UNVERIFIED;
  abstract readonly details: HostKeyMismatchDetails | HostKeyUnverifiedDetails;
}

/**
 * La clave del host no es la guardada. 409 con cuerpo tipado: el panel lo
 * reconoce por `code` y enseña el aviso con las dos huellas. Al ser una
 * HttpException, los servicios que ya dejan pasar esas excepciones (instalación
 * de servicios, controladores) la devuelven tal cual.
 */
export class HostKeyMismatchError extends HostKeyError {
  readonly code = HOST_KEY_MISMATCH;

  constructor(readonly details: HostKeyMismatchDetails) {
    super({
      statusCode: 409,
      error: 'Conflict',
      code: HOST_KEY_MISMATCH,
      message:
        `La clave de host de ${details.host}:${details.port} no coincide con la guardada. ` +
        'Puede ser un ataque de intermediario (MITM): la conexión se bloqueó antes de autenticarse.',
      hostKey: details,
    });
    this.name = 'HostKeyMismatchError';
  }
}

/**
 * Primera conexión a un servidor sin huella confirmada. Mismo 409 tipado que
 * el cambio de clave, sin huella esperada: el panel enseña la recibida y pide
 * comprobarla en el servidor antes de aceptarla.
 */
export class HostKeyUnverifiedError extends HostKeyError {
  readonly code = HOST_KEY_UNVERIFIED;

  constructor(readonly details: HostKeyUnverifiedDetails) {
    super({
      statusCode: 409,
      error: 'Conflict',
      code: HOST_KEY_UNVERIFIED,
      message:
        `${details.host}:${details.port} aún no tiene una clave de host confirmada. ` +
        'Compruébala en el servidor y acéptala antes de conectar: no se envió ninguna credencial.',
      hostKey: details,
    });
    this.name = 'HostKeyUnverifiedError';
  }
}

/** Lo que viaja por los sockets (terminal, SFTP) junto al mensaje de error. */
export function hostKeyErrorPayload(
  error: unknown,
): { code: HostKeyError['code']; hostKey: HostKeyError['details'] } | null {
  return error instanceof HostKeyError ? { code: error.code, hostKey: error.details } : null;
}

/**
 * Estado de la verificación de una conexión. `verifier` es el `hostVerifier`
 * síncrono de ssh2 (sin `hostHash`, recibe el blob crudo); el resto lo usa el
 * servicio para decidir qué error devolver y si hay que guardar la huella.
 */
export interface HostKeyGuard {
  verifier: (key: Buffer) => boolean;
  /** Clave recibida en el intercambio, si llegó a haberlo. */
  received(): HostKey | null;
  result(): HostKeyCheck | null;
}

/**
 * `allowFirstUse` solo para leer la clave sin autenticarse (`probeHostKey`):
 * en una conexión normal, un host sin huella corta antes de las credenciales.
 */
export function createHostKeyGuard(pinned: string | null | undefined, allowFirstUse = false): HostKeyGuard {
  let received: HostKey | null = null;
  let result: HostKeyCheck | null = null;
  return {
    verifier: (key: Buffer) => {
      received = describeHostKey(key);
      result = checkHostKey(pinned, received);
      return result === 'match' || (result === 'first-use' && allowFirstUse);
    },
    received: () => received,
    result: () => result,
  };
}
