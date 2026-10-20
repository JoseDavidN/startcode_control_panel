import { BadRequestException, ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { LoginDto } from '@auth/dto/login.dto';
import { RefreshTokenDto } from '@auth/dto/refresh-token.dto';
import { ChangePasswordDto } from '@auth/dto/update-profile.dto';
import { TwoFactorVerifyLoginDto } from '@auth/dto/two-factor.dto';

/* Mismas opciones que el ValidationPipe global de main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const validate = (metatype: ArgumentMetadata['metatype'], value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl';

describe('DTOs de autenticación', () => {
  describe('LoginDto', () => {
    it('acepta un login normal', async () => {
      await expect(validate(LoginDto, { email: 'ana@example.com', password: 'Clave123!' })).resolves.toBeInstanceOf(
        LoginDto,
      );
    });

    it.each([
      ['objeto en password', { email: 'ana@example.com', password: { $ne: null } }],
      ['array en password', { email: 'ana@example.com', password: ['a', 'b'] }],
      ['número en password', { email: 'ana@example.com', password: 12345678 }],
      ['objeto en email', { email: { $gt: '' }, password: 'x' }],
      ['array en email', { email: ['ana@example.com'], password: 'x' }],
      ['booleano en texto', { email: 'ana@example.com', password: true }],
      ['rememberMe como texto', { email: 'ana@example.com', password: 'x', rememberMe: 'true' }],
      ['rememberMe como objeto', { email: 'ana@example.com', password: 'x', rememberMe: {} }],
      ['inyección SQL en email', { email: "' OR 1=1 --", password: 'x' }],
      ['inyección SQL con @', { email: "admin@x.co' OR '1'='1", password: 'x' }],
      ['byte nulo en email', { email: 'ana\u0000@example.com', password: 'x' }],
      ['email larguísimo', { email: `${'a'.repeat(300)}@example.com`, password: 'x' }],
      ['password larguísima', { email: 'ana@example.com', password: 'a'.repeat(10_000) }],
      ['password vacía', { email: 'ana@example.com', password: '' }],
      ['campo extra', { email: 'ana@example.com', password: 'x', role: 'admin' }],
      ['sin campos', {}],
    ])('rechaza %s con 400', async (_label, body) => {
      await expect(validate(LoginDto, body)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('RefreshTokenDto', () => {
    it('acepta un JWT', async () => {
      await expect(validate(RefreshTokenDto, { refreshToken: JWT })).resolves.toBeInstanceOf(RefreshTokenDto);
    });

    it.each([
      ['objeto', { refreshToken: { a: 1 } }],
      ['array', { refreshToken: [JWT] }],
      ['texto que no es JWT', { refreshToken: "' OR 1=1 --" }],
      ['token larguísimo', { refreshToken: `${JWT}${'a'.repeat(5000)}` }],
      ['campo extra', { refreshToken: JWT, sid: 'x' }],
    ])('rechaza %s con 400', async (_label, body) => {
      await expect(validate(RefreshTokenDto, body)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('TwoFactorVerifyLoginDto', () => {
    it('rechaza un tempToken que no es texto', async () => {
      await expect(validate(TwoFactorVerifyLoginDto, { tempToken: { a: 1 }, code: '123456' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza un código numérico en lugar de texto', async () => {
      await expect(validate(TwoFactorVerifyLoginDto, { tempToken: JWT, code: 123456 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('Política de contraseña nueva', () => {
    it.each(['corta1!', 'sinmayusculas1!', 'SINMINUSCULAS1!', 'SinNumeros!!', 'SinSimbolo123', 'A1!a'.repeat(19)])(
      'rechaza %s',
      async newPassword => {
        await expect(validate(ChangePasswordDto, { currentPassword: 'x', newPassword })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      },
    );

    it.each(['Clave123!', 'Contraseña-Segura 9', 'Ñandú_2026x'])('acepta %s', async newPassword => {
      await expect(validate(ChangePasswordDto, { currentPassword: 'x', newPassword })).resolves.toBeInstanceOf(
        ChangePasswordDto,
      );
    });
  });
});
