import type { ConfigService } from '@nestjs/config';

/** Único algoritmo admitido: sin lista fija, un token con `alg` distinto podría colarse. */
export const JWT_ALGORITHM = 'HS256' as const;

/** 32 bytes de entropía como mínimo para HS256 (`openssl rand -hex 32` da 64 caracteres). */
export const JWT_SECRET_MIN_LENGTH = 32;

/** Valores de ejemplo de los `.env.*.example`: nunca valen como secreto real. */
const PLACEHOLDER = /cambia|genera_uno|change[_-]?me|secret_?key|^secret$/i;

/**
 * Secreto de firma de los JWT. Falla al arrancar si falta, es corto o sigue
 * siendo el de ejemplo: con un secreto débil cualquiera puede forjar tokens.
 */
export function jwtSecretOf(config: Pick<ConfigService, 'get'>): string {
  const secret = String(config.get<string>('JWT_SECRET') ?? '').trim();

  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET no está definido o tiene menos de ${JWT_SECRET_MIN_LENGTH} caracteres. ` +
        'Genera uno con `openssl rand -hex 64`.',
    );
  }
  if (PLACEHOLDER.test(secret)) {
    throw new Error('JWT_SECRET sigue siendo el valor de ejemplo. Genera uno con `openssl rand -hex 64`.');
  }
  return secret;
}
