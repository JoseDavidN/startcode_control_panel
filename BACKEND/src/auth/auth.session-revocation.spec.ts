import { randomBytes } from 'node:crypto';
import { AuthService } from '@auth/auth.service';
import { JwtStrategy } from '@auth/strategies/jwt.strategy';
import type { SessionSocketsService } from '@auth/session-sockets.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(() => Promise.resolve(true)),
  hash: jest.fn(() => Promise.resolve('hashed')),
}));

/**
 * Cada vía que revoca sesiones avisa al registro de sockets con las sesiones
 * exactas y el motivo: así se cortan al instante su terminal, SFTP y tiempo real.
 */
describe('AuthService: las revocaciones cortan los sockets', () => {
  const USER = 'user-1';

  function setup() {
    const sessionsRepo = {
      findOne: jest.fn(() => Promise.resolve({ id: 'sid-1', userId: USER })),
      find: jest.fn(() => Promise.resolve([{ id: 'sid-2' }, { id: 'sid-3' }])),
      update: jest.fn(() => Promise.resolve({ affected: 2 })),
    };
    const usersRepo = {
      findOne: jest.fn(() => Promise.resolve({ id: USER, password: 'x' })),
      update: jest.fn(() => Promise.resolve({})),
    };
    const sockets = { endSessions: jest.fn() };
    const config = { get: jest.fn((_k: string, d?: unknown) => d) };
    const service = new AuthService(
      usersRepo as never,
      sessionsRepo as never,
      {} as never,
      config as never,
      sockets as unknown as SessionSocketsService,
    );
    return { service, sessionsRepo, sockets };
  }

  it('logout corta los sockets de su sesión', async () => {
    const { service, sockets } = setup();
    await service.revokeSession(USER, 'sid-1', 'logout');
    expect(sockets.endSessions).toHaveBeenCalledWith(['sid-1'], 'logout');
  });

  it('cerrar una sesión de la lista corta solo esa', async () => {
    const { service, sockets } = setup();
    await service.revokeSession(USER, 'sid-1');
    expect(sockets.endSessions).toHaveBeenCalledWith(['sid-1'], 'revoked');
  });

  it('«cerrar otras sesiones» corta las demás y conserva la actual', async () => {
    const { service, sessionsRepo, sockets } = setup();
    await service.revokeOtherSessions(USER, 'sid-1');

    const where = (sessionsRepo.find.mock.calls[0] as unknown as [{ where: { id: unknown } }])[0].where;
    expect(where).toEqual(expect.objectContaining({ userId: USER, revoked: false }));
    expect(where.id).toBeDefined();
    expect(sockets.endSessions).toHaveBeenCalledWith(['sid-2', 'sid-3'], 'revoked');
  });

  it('cambiar la contraseña corta las otras sesiones con su motivo', async () => {
    const { service, sockets } = setup();
    await service.changePassword(USER, { currentPassword: 'a', newPassword: 'b' } as never, 'sid-1');
    expect(sockets.endSessions).toHaveBeenCalledWith(['sid-2', 'sid-3'], 'password');
  });

  it('JwtStrategy: el cierre por inactividad en HTTP también corta los sockets', async () => {
    const sessionsRepo = {
      findOne: jest.fn(() =>
        Promise.resolve({
          id: 'sid-1',
          userId: USER,
          revoked: false,
          persistent: false,
          expiresAt: new Date(Date.now() + 3_600_000),
          lastUsed: new Date(Date.now() - 31 * 60_000),
        }),
      ),
      update: jest.fn(() => Promise.resolve({})),
    };
    const usersRepo = { findOne: jest.fn(() => Promise.resolve({ id: USER, isActive: true, preferences: null })) };
    const sockets = { endSessions: jest.fn() };
    const config = { get: jest.fn(() => randomBytes(32).toString('hex')) };
    const strategy = new JwtStrategy(
      config as never,
      usersRepo as never,
      sessionsRepo as never,
      sockets as unknown as SessionSocketsService,
    );

    await expect(
      strategy.validate({ sub: USER, email: 'e', role: 'user', type: 'access', sid: 'sid-1' }),
    ).rejects.toThrow('inactividad');
    expect(sockets.endSessions).toHaveBeenCalledWith(['sid-1'], 'inactivity');
  });
});
