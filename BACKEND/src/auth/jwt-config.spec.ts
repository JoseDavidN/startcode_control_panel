import { JWT_SECRET_MIN_LENGTH, jwtSecretOf } from '@auth/jwt-config';

const configWith = (secret?: string) => ({ get: () => secret }) as never;

describe('jwtSecretOf', () => {
  it('falla sin secreto', () => {
    expect(() => jwtSecretOf(configWith(undefined))).toThrow(/JWT_SECRET/);
  });

  it('falla con un secreto corto', () => {
    expect(() => jwtSecretOf(configWith('a'.repeat(JWT_SECRET_MIN_LENGTH - 1)))).toThrow(/JWT_SECRET/);
  });

  it('falla con el valor de ejemplo de los .env.example', () => {
    expect(() => jwtSecretOf(configWith('cambia_este_secret_por_uno_seguro_de_64_caracteres_minimo'))).toThrow(
      /ejemplo/,
    );
    expect(() => jwtSecretOf(configWith('genera_uno_con_openssl_rand_hex_64'))).toThrow();
  });

  it('acepta un secreto aleatorio largo', () => {
    const secret = 'f3a9c1'.repeat(11);
    expect(jwtSecretOf(configWith(secret))).toBe(secret);
  });
});
