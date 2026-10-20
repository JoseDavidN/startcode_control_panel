import type { Socket } from 'socket.io';
import { AgentGateway } from '@monitoring/gateways/agent.gateway';
import { AgentMessageType } from '@monitoring/dto/agent-message.dto';
import type { AgentTokenCheck, AgentTokenService } from '@servers/services/agent-token.service';
import { ServerStatus } from '@servers/entities/server.entity';

/**
 * Lado del agente en el namespace `/agent`: el token se valida contra el
 * servidor en cada mensaje, un rechazo es un 401 que el agente reconoce, y la
 * rotación viaja por el socket ya autenticado y se confirma con el ACK.
 */
describe('AgentGateway: token del agente', () => {
  const SERVER = { id: 'srv-1', name: 'web-1', ownerId: 'owner-1', status: ServerStatus.ONLINE };

  function setup(verify: (token: string) => AgentTokenCheck) {
    const agentTokens = {
      verify: jest.fn((token: string) => Promise.resolve(verify(token))),
      beginRotation: jest.fn(() => Promise.resolve({ token: 'tok-new', jti: 'jti-new' })),
    };
    const serversRepository = { update: jest.fn(() => Promise.resolve()), findOne: jest.fn() };
    const gateway = new AgentGateway(
      serversRepository as never, {} as never, {} as never,
      {} as never, { get: jest.fn() } as never,
      {} as never, {} as never, {} as never,
      agentTokens as unknown as AgentTokenService,
    );
    const toOwner = { emit: jest.fn() };
    gateway.server = { to: jest.fn(() => toOwner) } as never;
    return { gateway, agentTokens, toOwner, serversRepository };
  }

  function socket(id = 'sock-1') {
    return {
      id,
      connected: true,
      handshake: { auth: {} },
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket & { emit: jest.Mock; disconnect: jest.Mock };
  }

  const heartbeat = (token: string) => ({
    messageId: 'm-1',
    agentVersion: '2.2.0-go',
    timestamp: Date.now(),
    serverId: SERVER.id,
    token,
    type: AgentMessageType.HEARTBEAT,
    data: {},
  });

  const ok = (overrides: Partial<Extract<AgentTokenCheck, { ok: true }>> = {}): AgentTokenCheck => ({
    ok: true,
    server: SERVER as never,
    tokenId: 'jti-current',
    slot: 'current',
    needsRotation: false,
    ...overrides,
  });

  afterEach(() => jest.useRealTimers());

  it('un token revocado recibe un 401 explícito y se desconecta', async () => {
    const { gateway } = setup(() => ({ ok: false, reason: 'revoked' }));
    const client = socket();

    await gateway.handleMessage(client, heartbeat('tok-old'));

    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ status: 401, code: 'AGENT_TOKEN_REJECTED', reason: 'revoked' }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(gateway.isAgentConnected(SERVER.id)).toBe(false);
  });

  it('un fallo de base de datos no es un 401: no se desconecta al agente', async () => {
    const { gateway, agentTokens } = setup(() => ok());
    agentTokens.verify.mockRejectedValueOnce(new Error('connection refused'));
    const client = socket();

    await gateway.handleMessage(client, heartbeat('tok'));

    expect(client.emit).toHaveBeenCalledWith('error', { message: 'Error procesando mensaje' });
    expect(client.emit).not.toHaveBeenCalledWith('error', expect.objectContaining({ status: 401 }));
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('un token que toca rotar recibe uno nuevo por su socket, una sola vez', async () => {
    const { gateway, agentTokens } = setup(() => ok({ needsRotation: true, slot: 'legacy' }));
    const client = socket();

    await gateway.handleMessage(client, heartbeat('tok-legacy'));
    await gateway.handleMessage(client, heartbeat('tok-legacy'));
    await new Promise(setImmediate);

    expect(agentTokens.beginRotation).toHaveBeenCalledTimes(1);
    expect(client.emit).toHaveBeenCalledWith('agent:token:rotate', { token: 'tok-new' });
    expect(client.emit).toHaveBeenCalledWith('ack', { messageId: 'm-1' });
  });

  it('el ACK con el token nuevo confirma la rotación y avisa al dueño', async () => {
    const { gateway, agentTokens, toOwner } = setup(() => ok({ needsRotation: true }));
    const client = socket();
    await gateway.handleMessage(client, heartbeat('tok-old'));
    await new Promise(setImmediate);

    agentTokens.verify.mockResolvedValueOnce(ok({ tokenId: 'jti-new', slot: 'pending' }));
    await gateway.handleTokenAck(client, { serverId: SERVER.id, token: 'tok-new' });

    expect(agentTokens.verify).toHaveBeenLastCalledWith('tok-new', SERVER.id);
    expect(toOwner.emit).toHaveBeenCalledWith('agent:token:rotated', { serverId: SERVER.id });
  });

  it('un ACK con un token que no vale se rechaza con 401', async () => {
    const { gateway } = setup(() => ({ ok: false, reason: 'revoked' }));
    const client = socket();

    await gateway.handleTokenAck(client, { serverId: SERVER.id, token: 'tok-falso' });

    expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ status: 401 }));
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('un mensaje firmado con el pendiente (ACK perdido) también cierra la rotación', async () => {
    const { gateway, toOwner } = setup(() => ok({ slot: 'pending', tokenId: 'jti-new' }));

    await gateway.handleMessage(socket(), heartbeat('tok-new'));

    expect(toOwner.emit).toHaveBeenCalledWith('agent:token:rotated', { serverId: SERVER.id });
  });

  it('rotación manual: con agente conectado se envía; sin él, «offline»', async () => {
    const { gateway, agentTokens } = setup(() => ok());
    expect(await gateway.rotateAgentToken(SERVER)).toBe('offline');
    expect(agentTokens.beginRotation).not.toHaveBeenCalled();

    const client = socket();
    await gateway.handleMessage(client, heartbeat('tok'));
    expect(await gateway.rotateAgentToken(SERVER)).toBe('rotating');
    expect(client.emit).toHaveBeenCalledWith('agent:token:rotate', { token: 'tok-new' });
  });

  it('durante una instalación no se rota (pisaría el token del instalador)', async () => {
    const { gateway, agentTokens } = setup(() => ok({ needsRotation: true }));
    gateway.holdRotations(SERVER.id, true);
    const client = socket();

    await gateway.handleMessage(client, heartbeat('tok'));
    await new Promise(setImmediate);
    expect(agentTokens.beginRotation).not.toHaveBeenCalled();
    await expect(gateway.rotateAgentToken(SERVER)).rejects.toThrow('instalación');

    gateway.holdRotations(SERVER.id, false);
    expect(await gateway.rotateAgentToken(SERVER)).toBe('rotating');
  });

  it('revocar corta el socket vivo del agente con 401', async () => {
    const { gateway } = setup(() => ok());
    const client = socket();
    await gateway.handleMessage(client, heartbeat('tok'));

    gateway.disconnectAgent(SERVER.id);

    expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ status: 401, reason: 'revoked' }));
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});
