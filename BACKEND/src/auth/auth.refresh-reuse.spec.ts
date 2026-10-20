import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService, REFRESH_REUSED } from '@auth/auth.service';
import type { SessionSocketsService } from '@auth/session-sockets.service';

/**
 * Reutilización del refresh token: el anterior a la última rotación vale unos
 * segundos (respuesta perdida, renovaciones cruzadas); después, o cualquier
 * otro ya rotado, revoca la sesión entera, corta sus sockets y avisa.
 */
describe('AuthService: reutilización del refresh token', () => {
  const USER = { id: 'user-1', email: 'a@b.c', firstname: 'A', lastname: 'B', role: 'admin', isActive: true };
  const SID = 'sid-1';
  const hash = (t: string) => createHash('sha256').update(t).digest('hex');

  function setup(session: Record<string, unknown>, affected = 1) {
    const sessionsRepo = {
      findOne: jest.fn(() =>
        Promise.resolve({
          id: SID,
          userId: USER.id,
          revoked: false,
          persistent: false,
          expiresAt: new Date(Date.now() + 60_000),
          refreshHash: hash('actual'),
          previousRefreshHash: null,
          refreshRotatedAt: null,
          ...session,
        }),
      ),
      update: jest.fn(() => Promise.resolve({ affected })),
    };
    const usersRepo = { findOne: jest.fn(() => Promise.resolve(USER)) };
    const jwt = {
      verify: jest.fn(() => ({ sub: USER.id, type: 'refresh', sid: SID })),
      sign: jest.fn(() => 'nuevo.token'),
    };
    const sockets = { endSessions: jest.fn() };
    const config = { get: jest.fn((_k: string, d?: unknown) => d ?? 'x'.repeat(40)) };
    const service = new AuthService(
      usersRepo as never,
      sessionsRepo as never,
      jwt as never,
      config as never,
      sockets as unknown as SessionSocketsService,
    );
    const reuse = jest.fn();
    service.onRefreshReuse(reuse);
    return { service, sessionsRepo, sockets, reuse };
  }

  const updates = (repo: { update: jest.Mock }) => repo.update.mock.calls as unknown as [unknown, Record<string, unknown>][];

  it('al rotar guarda el anterior y cuándo, condicionado al hash leído', async () => {
    const { service, sessionsRepo } = setup({});
    await service.refreshToken('actual');

    const [where, patch] = updates(sessionsRepo)[0];
    expect(where).toEqual({ id: SID, refreshHash: hash('actual') });
    expect(patch.refreshHash).toBe(hash('nuevo.token'));
    expect(patch.previousRefreshHash).toBe(hash('actual'));
    expect(patch.refreshRotatedAt).toBeInstanceOf(Date);
  });

  it('acepta el anterior dentro de la gracia sin alargarla ni revocar', async () => {
    const { service, sessionsRepo, sockets, reuse } = setup({
      previousRefreshHash: hash('anterior'),
      refreshRotatedAt: new Date(Date.now() - 5_000),
    });

    await expect(service.refreshToken('anterior')).resolves.toMatchObject({ refreshToken: 'nuevo.token' });
    const [, patch] = updates(sessionsRepo)[0];
    expect(patch).not.toHaveProperty('previousRefreshHash');
    expect(patch).not.toHaveProperty('refreshRotatedAt');
    expect(sockets.endSessions).not.toHaveBeenCalled();
    expect(reuse).not.toHaveBeenCalled();
  });

  it.each([
    ['el anterior pasada la gracia', { previousRefreshHash: hash('anterior'), refreshRotatedAt: new Date(Date.now() - 60_000) }, 'anterior'],
    ['uno más antiguo que el anterior', { previousRefreshHash: hash('anterior'), refreshRotatedAt: new Date() }, 'antiquisimo'],
    ['uno ya rotado sin anterior guardado', {}, 'viejo'],
  ])('%s revoca la sesión, corta sus sockets y avisa', async (_label, session, token) => {
    const { service, sessionsRepo, sockets, reuse } = setup(session);

    const error = await service.refreshToken(token, { ip: '203.0.113.9' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({ code: REFRESH_REUSED });
    expect(sessionsRepo.update).toHaveBeenCalledWith(SID, { revoked: true });
    expect(sockets.endSessions).toHaveBeenCalledWith([SID], 'reuse');
    expect(reuse).toHaveBeenCalledWith(USER.id, expect.objectContaining({ sessionId: SID, ip: '203.0.113.9' }));
  });

  it('dos renovaciones cruzadas: la que pierde la carrera da 401 sin revocar', async () => {
    const { service, sockets } = setup({}, 0);

    await expect(service.refreshToken('actual')).rejects.toThrow(UnauthorizedException);
    expect(sockets.endSessions).not.toHaveBeenCalled();
  });

  it('una sesión ya revocada no vuelve a avisar', async () => {
    const { service, sockets, reuse } = setup({ revoked: true });

    await expect(service.refreshToken('viejo')).rejects.toThrow(UnauthorizedException);
    expect(sockets.endSessions).not.toHaveBeenCalled();
    expect(reuse).not.toHaveBeenCalled();
  });
});
