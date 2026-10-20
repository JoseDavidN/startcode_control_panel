import type { Socket } from 'socket.io';
import { AgentGateway } from '@monitoring/gateways/agent.gateway';
import type { WsAuthService } from '@auth/ws-auth.service';

/**
 * Conexión del panel al namespace `/agent`: la room se decide por el usuario
 * del token verificado, nunca por lo que mande el cliente, y un token de una
 * sesión revocada no se suscribe a nada.
 */
describe('AgentGateway: conexión del panel', () => {
  const OWNER = '00000000-0000-4000-8000-00000000000a';
  const OTHER = '00000000-0000-4000-8000-00000000000b';

  function setup(authenticate: WsAuthService['authenticate']) {
    const authenticateMock = jest.fn(authenticate);
    const wsAuth = { authenticate: authenticateMock } as unknown as WsAuthService;
    const jwtService = { verify: jest.fn() };
    const gateway = new AgentGateway(
      {} as never, {} as never, {} as never,
      jwtService as never, { get: jest.fn() } as never,
      {} as never, {} as never, wsAuth, {} as never,
    );
    return { gateway, authenticateMock, jwtService };
  }

  function socket(auth: Record<string, unknown>) {
    return {
      id: 'sock-1',
      handshake: { auth },
      join: jest.fn(() => Promise.resolve()),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket & { join: jest.Mock; emit: jest.Mock; disconnect: jest.Mock };
  }

  it('valida el token con WsAuthService (sesión viva y usuario activo)', async () => {
    const { gateway, authenticateMock, jwtService } = setup(() => Promise.resolve({ id: OWNER } as never));
    const client = socket({ token: 'tok' });

    await gateway.handleConnection(client);

    expect(authenticateMock).toHaveBeenCalledWith('tok', client);
    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(client.join).toHaveBeenCalledWith(`user:${OWNER}`);
    expect(client.emit).toHaveBeenCalledWith('panel:ready');
  });

  it('ignora un userId enviado por el cliente: la room sale del token', async () => {
    const { gateway } = setup(() => Promise.resolve({ id: OWNER } as never));
    const client = socket({ token: 'tok', userId: OTHER, sub: OTHER });

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledTimes(1);
    expect(client.join).toHaveBeenCalledWith(`user:${OWNER}`);
  });

  it('un token de sesión revocada o caducado se desconecta sin unirse a ninguna room', async () => {
    const { gateway } = setup(() => Promise.reject(new Error('Sesión revocada')));
    const client = socket({ token: 'tok' });

    await gateway.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).not.toHaveBeenCalledWith('panel:ready');
  });
});
