import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';

/* Login con 2FA y dispositivo de confianza. Se instancia AuthService a mano
   con un JwtService real: lo que se prueba es la firma y la huella del token. */
describe('AuthService · dispositivo de confianza 2FA', () => {
  const SECRET = 'test-secret';
  const jwt = new JwtService({ secret: SECRET });
  const config = { get: (key: string, fallback?: unknown) => (key === 'JWT_SECRET' ? SECRET : fallback) } as ConfigService;

  let user: User;
  let users: { findOne: jest.Mock; update: jest.Mock };
  let service: AuthService;

  beforeEach(async () => {
    user = {
      id: 'u1',
      email: 'a@b.co',
      password: await bcrypt.hash('Clave123!', 4),
      isActive: true,
      twoFactorEnabled: true,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      passwordChangedAt: new Date('2026-10-01T00:00:00Z'),
      failedLoginAttempts: 0,
      lockedUntil: null,
    } as unknown as User;
    users = { findOne: jest.fn().mockResolvedValue(user), update: jest.fn() };
    service = new AuthService(users as never, {} as never, jwt, config);
  });

  const trustToken = (claims: Record<string, unknown> = {}, expiresIn = '7d') => {
    const fp = (service as unknown as { trustFingerprint: (u: User) => string }).trustFingerprint(user);
    return jwt.sign({ sub: user.id, type: '2fa-trusted', fp, ...claims }, { expiresIn });
  };

  const login = (trustedDeviceToken?: string) =>
    service.login({ email: user.email, password: 'Clave123!', trustedDeviceToken });

  it('pide el código sin token de confianza', async () => {
    await expect(login()).resolves.toMatchObject({ requiresTwoFactor: true });
  });

  it('no pide el código con un token válido', async () => {
    const spy = jest.spyOn(service as never, 'buildAuthResponse').mockResolvedValue({ token: 'ok' } as never);
    await expect(login(trustToken())).resolves.toEqual({ token: 'ok' });
    expect(spy).toHaveBeenCalled();
  });

  it('lo pide si el token es de otro usuario, caducó o es de otro tipo', async () => {
    await expect(login(trustToken({ sub: 'otro' }))).resolves.toMatchObject({ requiresTwoFactor: true });
    await expect(login(trustToken({}, '-1s'))).resolves.toMatchObject({ requiresTwoFactor: true });
    await expect(login(trustToken({ type: '2fa-pending' }))).resolves.toMatchObject({ requiresTwoFactor: true });
  });

  it('lo pide tras cambiar la contraseña o el secreto 2FA', async () => {
    const token = trustToken();
    user.passwordChangedAt = new Date('2026-10-08T00:00:00Z');
    await expect(login(token)).resolves.toMatchObject({ requiresTwoFactor: true });

    user.passwordChangedAt = new Date('2026-10-01T00:00:00Z');
    user.twoFactorSecret = 'OTROSECRETO234567';
    await expect(login(token)).resolves.toMatchObject({ requiresTwoFactor: true });
  });
});
