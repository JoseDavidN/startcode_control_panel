import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';

/**
 * Verificación de la clave de host SSH con TOFU (confianza en el primer uso).
 *
 * Cada servidor guarda el algoritmo y la huella `SHA256:<base64>` (la misma
 * que enseña OpenSSH) de la clave que presentó la primera vez. Después, una
 * clave distinta corta la conexión antes de autenticarse: la llave privada del
 * panel nunca llega a firmar para un host suplantado.
 */

export interface HostKey {
  /** Tipo de la clave (`ssh-ed25519`, `ssh-rsa`, `ecdsa-sha2-nistp256`…). */
  algorithm: string;
  /** `SHA256:<base64 sin relleno>`, como `ssh-keygen -lf`. */
  fingerprint: string;
}

export const HOST_KEY_MISMATCH = 'HOST_KEY_MISMATCH';

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

/**
 * La clave del host no es la guardada. 409 con cuerpo tipado: el panel lo
 * reconoce por `code` y enseña el aviso con las dos huellas. Al ser una
 * HttpException, los servicios que ya dejan pasar esas excepciones (instalación
 * de servicios, controladores) la devuelven tal cual.
 */
export class HostKeyMismatchError extends ConflictException {
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

/** Lo que viaja por los sockets (terminal, SFTP) junto al mensaje de error. */
export function hostKeyErrorPayload(
  error: unknown,
): { code: typeof HOST_KEY_MISMATCH; hostKey: HostKeyMismatchDetails } | null {
  return error instanceof HostKeyMismatchError
    ? { code: HOST_KEY_MISMATCH, hostKey: error.details }
    : null;
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

export function createHostKeyGuard(pinned: string | null | undefined): HostKeyGuard {
  let received: HostKey | null = null;
  let result: HostKeyCheck | null = null;
  return {
    verifier: (key: Buffer) => {
      received = describeHostKey(key);
      result = checkHostKey(pinned, received);
      return result !== 'mismatch';
    },
    received: () => received,
    result: () => result,
  };
}
