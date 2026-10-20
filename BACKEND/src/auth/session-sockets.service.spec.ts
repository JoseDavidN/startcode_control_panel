import { EventEmitter } from 'node:events';
import type { Socket } from 'socket.io';
import {
  AUTH_REVOKED_EVENT,
  SessionSocketsService,
} from '@auth/session-sockets.service';

/**
 * Los sockets del panel siguen a su sesión: revocarla, que expire o que se
 * cierre por inactividad corta sus sockets, y solo los suyos.
 */
describe('SessionSocketsService', () => {
  const USER = '00000000-0000-4000-8000-00000000000a';
  const SID_A = '00000000-0000-4000-8000-0000000000a1';
  const SID_B = '00000000-0000-4000-8000-0000000000b1';
  const MINUTE = 60_000;

  type FakeSocket = Socket & { emit: jest.Mock; disconnect: jest.Mock };

  function fakeSocket(): FakeSocket {
    const ee = new EventEmitter() as EventEmitter & Record<string, unknown>;
    const socket = Object.assign(ee, {
      disconnected: false,
      emit: jest.fn(),
      disconnect: jest.fn(() => {
        socket.disconnected = true;
        ee.listeners('disconnect').forEach((fn) => (fn as () => void)());
        ee.removeAllListeners('disconnect');
      }),
    });
    return socket as unknown as FakeSocket;
  }

  function setup(opts: {
    sessions?: Record<string, Partial<{ revoked: boolean; expiresAt: Date; lastUsed: Date; persistent: boolean; userId: string }>>;
    user?: Partial<{ isActive: boolean; preferences: unknown }> | null;
  } = {}) {
    const now = Date.now();
    const rows = Object.entries(opts.sessions ?? {}).map(([id, s]) => ({
      id,
      userId: USER,
      revoked: false,
      persistent: false,
      expiresAt: new Date(now + 60 * MINUTE),
      lastUsed: new Date(now),
      ...s,
    }));
    const sessionsRepo = {
      find: jest.fn(() => Promise.resolve(rows)),
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    const user = opts.user === null ? null : { id: USER, isActive: true, preferences: null, ...opts.user };
    const usersRepo = { find: jest.fn(() => Promise.resolve(user ? [user] : [])) };
    const service = new SessionSocketsService(usersRepo as never, sessionsRepo as never);
    return { service, sessionsRepo, usersRepo, now };
  }

  const revokedWith = (socket: FakeSocket, reason: string) => {
    expect(socket.emit).toHaveBeenCalledWith(
      AUTH_REVOKED_EVENT,
      expect.objectContaining({ reason, message: expect.any(String) as string }),
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  };

  describe('revocación', () => {
    it('corta todos los sockets de la sesión y no los de otra sesión del mismo usuario', () => {
      const { service } = setup();
      const terminal = fakeSocket();
      const sftp = fakeSocket();
      const agent = fakeSocket();
      const otherSession = fakeSocket();
      const onEnd = jest.fn();

      service.register(terminal, SID_A, USER);
      service.register(sftp, SID_A, USER, onEnd);
      service.register(agent, SID_A, USER);
      service.register(otherSession, SID_B, USER);

      expect(service.endSessions([SID_A], 'logout')).toBe(3);

      revokedWith(terminal, 'logout');
      revokedWith(sftp, 'logout');
      revokedWith(agent, 'logout');
      expect(onEnd).toHaveBeenCalledWith('logout');
      expect(otherSession.emit).not.toHaveBeenCalled();
      expect(otherSession.disconnect).not.toHaveBeenCalled();
      expect(service.countFor(SID_A)).toBe(0);
      expect(service.countFor(SID_B)).toBe(1);
    });

    it('avisa con auth:revoked antes de desconectar', () => {
      const { service } = setup();
      const socket = fakeSocket();
      const order: string[] = [];
      socket.emit.mockImplementation(() => order.push('emit'));
      socket.disconnect.mockImplementation(() => order.push('disconnect'));
      service.register(socket, SID_A, USER);

      service.endSessions([SID_A], 'revoked');

      expect(order).toEqual(['emit', 'disconnect']);
    });

    it('un socket que se registra justo después de revocar su sesión se corta', () => {
      const { service } = setup();
      service.endSessions([SID_A], 'password');
      const late = fakeSocket();

      expect(service.register(late, SID_A, USER)).toBe(false);
      revokedWith(late, 'password');
    });

    it('un socket que se desconecta solo deja de estar registrado', () => {
      const { service } = setup();
      const socket = fakeSocket();
      service.register(socket, SID_A, USER);
      socket.disconnect(true);
      expect(service.countFor(SID_A)).toBe(0);
    });
  });

  describe('barrido periódico', () => {
    it('corta los sockets de una sesión revocada fuera de AuthService', async () => {
      const { service } = setup({ sessions: { [SID_A]: { revoked: true }, [SID_B]: {} } });
      const a = fakeSocket();
      const b = fakeSocket();
      service.register(a, SID_A, USER);
      service.register(b, SID_B, USER);

      await service.sweep();

      revokedWith(a, 'revoked');
      expect(b.disconnect).not.toHaveBeenCalled();
    });

    it('corta los sockets de una sesión que ya no existe o cuyo usuario se desactivó', async () => {
      const gone = setup({ sessions: {} });
      const s1 = fakeSocket();
      gone.service.register(s1, SID_A, USER);
      await gone.service.sweep();
      revokedWith(s1, 'revoked');

      const inactive = setup({ sessions: { [SID_A]: {} }, user: { isActive: false } });
      const s2 = fakeSocket();
      inactive.service.register(s2, SID_A, USER);
      await inactive.service.sweep();
      revokedWith(s2, 'user');
    });

    it('cierra la sesión expirada', async () => {
      const { service, now } = setup({ sessions: { [SID_A]: { expiresAt: new Date(Date.now() - 1000) } } });
      const socket = fakeSocket();
      service.register(socket, SID_A, USER);

      await service.sweep(now);

      revokedWith(socket, 'expired');
    });

    it('cierra por inactividad con el mismo límite que HTTP y revoca la sesión', async () => {
      const { service, sessionsRepo, now } = setup({
        sessions: { [SID_A]: { lastUsed: new Date(Date.now() - 31 * MINUTE) } },
      });
      const socket = fakeSocket();
      service.register(socket, SID_A, USER);

      await service.sweep(now);

      revokedWith(socket, 'inactivity');
      expect(sessionsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.anything() as unknown }),
        { revoked: true },
      );
    });

    it('escribir en la terminal es actividad: no se cierra aunque no haya HTTP', async () => {
      const { service, sessionsRepo, now } = setup({
        sessions: { [SID_A]: { lastUsed: new Date(Date.now() - 31 * MINUTE) } },
      });
      const socket = fakeSocket();
      service.register(socket, SID_A, USER);

      service.touch(socket);
      await service.sweep(now);

      expect(socket.disconnect).not.toHaveBeenCalled();
      /* Y refresca `lastUsed`, para que la siguiente petición HTTP tampoco la dé por inactiva. */
      expect(sessionsRepo.update).toHaveBeenCalledWith(
        { id: SID_A, revoked: false },
        { lastUsed: expect.any(Date) as Date },
      );
    });

    it('lo que solo recibe (métricas) no cuenta: sin touch se cierra igual', async () => {
      const { service, now } = setup({
        sessions: { [SID_A]: { lastUsed: new Date(Date.now() - 31 * MINUTE) } },
      });
      const metrics = fakeSocket();
      const terminal = fakeSocket();
      service.register(metrics, SID_A, USER);
      service.register(terminal, SID_A, USER);

      await service.sweep(now + 1000);

      revokedWith(metrics, 'inactivity');
      revokedWith(terminal, 'inactivity');
    });

    it('respeta la preferencia de cada usuario y las sesiones persistentes', async () => {
      const custom = setup({
        sessions: { [SID_A]: { lastUsed: new Date(Date.now() - 6 * MINUTE) } },
        user: { preferences: { security: { sessionTimeout: 5 } } },
      });
      const s1 = fakeSocket();
      custom.service.register(s1, SID_A, USER);
      await custom.service.sweep(custom.now);
      revokedWith(s1, 'inactivity');

      const persistent = setup({
        sessions: { [SID_A]: { lastUsed: new Date(Date.now() - 600 * MINUTE), persistent: true } },
      });
      const s2 = fakeSocket();
      persistent.service.register(s2, SID_A, USER);
      await persistent.service.sweep(persistent.now);
      expect(s2.disconnect).not.toHaveBeenCalled();

      const never = setup({
        sessions: { [SID_A]: { lastUsed: new Date(Date.now() - 600 * MINUTE) } },
        user: { preferences: { security: { sessionTimeout: 0 } } },
      });
      const s3 = fakeSocket();
      never.service.register(s3, SID_A, USER);
      await never.service.sweep(never.now);
      expect(s3.disconnect).not.toHaveBeenCalled();
    });

    it('si la base de datos falla no corta nada', async () => {
      const { service, sessionsRepo } = setup();
      sessionsRepo.find.mockImplementationOnce(() => Promise.reject(new Error('db caída')));
      const socket = fakeSocket();
      service.register(socket, SID_A, USER);

      await service.sweep();

      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('el intervalo no retiene el proceso y se limpia al destruir el módulo', () => {
      const { service } = setup();
      const spy = jest.spyOn(global, 'clearInterval');
      service.onModuleInit();
      const timer = (service as unknown as { timer: NodeJS.Timeout }).timer;
      expect(timer.hasRef()).toBe(false);
      service.onModuleDestroy();
      expect(spy).toHaveBeenCalledWith(timer);
      spy.mockRestore();
    });
  });
});
