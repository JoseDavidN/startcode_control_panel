import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { AuthService } from '@auth/auth.service';
import type { Server } from '@servers/entities/server.entity';
import {
  AGENT_TOKEN_GRACE_MS,
  AGENT_TOKEN_ROTATE_AFTER_MS,
  AgentTokenService,
} from '@servers/services/agent-token.service';

const SECRET = 'x'.repeat(64);
const SERVER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';

type Row = Pick<
  Server,
  | 'id'
  | 'name'
  | 'ownerId'
  | 'agentTokenId'
  | 'agentTokenPendingId'
  | 'agentTokenPreviousId'
  | 'agentTokenPreviousUntil'
  | 'agentTokenIssuedAt'
  | 'agentTokenLegacy'
>;

/**
 * Repositorio en memoria con lo que usa el servicio: `update`, el query
 * builder de lectura y los dos UPDATE condicionados en SQL (confirmar rotación
 * y fijar un token heredado), con la misma semántica que en Postgres.
 */
function fakeRepo(rows: Map<string, Row>) {
  const getOne = (id: string) => {
    const row = rows.get(id);
    return Promise.resolve(row ? ({ ...row } as Server) : null);
  };

  return {
    update: jest.fn((id: string, patch: Partial<Row>) => {
      const row = rows.get(id);
      if (row) Object.assign(row, patch);
      return Promise.resolve({ affected: row ? 1 : 0 });
    }),
    createQueryBuilder: jest.fn(() => {
      let id = '';
      const qb = {
        select: () => qb,
        addSelect: () => qb,
        where: (_: string, params: { id: string }) => {
          id = params.id;
          return qb;
        },
        getOne: () => getOne(id),
      };
      return qb;
    }),
    query: jest.fn((sql: string, params: unknown[]) => {
      const row = rows.get(params[0] as string);
      if (sql.includes('str_agent_token_pending_id = $2')) {
        if (!row || row.agentTokenPendingId !== params[1]) return Promise.resolve([[], 0]);
        row.agentTokenPreviousId = row.agentTokenId;
        row.agentTokenPreviousUntil = row.agentTokenId ? (params[2] as Date) : null;
        row.agentTokenId = row.agentTokenPendingId;
        row.agentTokenPendingId = null;
        row.agentTokenIssuedAt = new Date();
        row.agentTokenLegacy = false;
        return Promise.resolve([[], 1]);
      }
      if (sql.includes('bol_agent_token_legacy = TRUE')) {
        if (!row || !row.agentTokenLegacy) return Promise.resolve([[], 0]);
        row.agentTokenId = params[1] as string;
        row.agentTokenIssuedAt = new Date();
        row.agentTokenLegacy = false;
        return Promise.resolve([[], 1]);
      }
      throw new Error(`SQL no esperado: ${sql}`);
    }),
  };
}

function setup(overrides: Partial<Row> = {}) {
  const rows = new Map<string, Row>();
  rows.set(SERVER_ID, {
    id: SERVER_ID,
    name: 'web-1',
    ownerId: 'owner-1',
    agentTokenId: null,
    agentTokenPendingId: null,
    agentTokenPreviousId: null,
    agentTokenPreviousUntil: null,
    agentTokenIssuedAt: null,
    agentTokenLegacy: false,
    ...overrides,
  });

  const jwt = new JwtService({ secret: SECRET, verifyOptions: { algorithms: ['HS256'] } });
  const auth = {
    generateAgentToken: (serverId: string, serverName: string, jti: string) =>
      jwt.sign({ sub: serverId, type: 'agent', serverName, jti }, { expiresIn: '30d' }),
  } as unknown as AuthService;
  const config = { get: (key: string) => (key === 'JWT_SECRET' ? SECRET : undefined) } as unknown as ConfigService;
  const repo = fakeRepo(rows);

  const service = new AgentTokenService(repo as unknown as Repository<Server>, jwt, config, auth);
  const row = () => rows.get(SERVER_ID)!;

  /** Token con el formato anterior a 0.11.1: sin `jti`, 365 días. */
  const legacyToken = (serverId = SERVER_ID) =>
    jwt.sign({ sub: serverId, type: 'agent', serverName: 'web-1' }, { expiresIn: '365d' });

  return { service, jwt, repo, row, rows, legacyToken };
}

describe('AgentTokenService', () => {
  afterEach(() => jest.useRealTimers());

  describe('emisión y validación', () => {
    it('un token emitido y activado es el único válido, sin rotación inmediata', async () => {
      const { service, jwt, row } = setup();
      const token = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });

      const claims = jwt.decode<{ jti: string; type: string; sub: string }>(token);
      expect(claims).toMatchObject({ type: 'agent', sub: SERVER_ID });
      expect(row().agentTokenId).toBe(claims.jti);
      expect(row().agentTokenLegacy).toBe(false);

      const check = await service.verify(token, SERVER_ID);
      expect(check).toMatchObject({ ok: true, slot: 'current', needsRotation: false });
    });

    it('cada emisión invalida la anterior', async () => {
      const { service } = setup();
      const first = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });
      const second = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });

      expect(await service.verify(first, SERVER_ID)).toEqual({ ok: false, reason: 'revoked' });
      expect(await service.verify(second, SERVER_ID)).toMatchObject({ ok: true });
    });

    it('rechaza firma inválida, otro tipo, otro servidor y servidor borrado', async () => {
      const { service, jwt, rows } = setup();
      const token = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });

      const forged = new JwtService({ secret: 'y'.repeat(64) }).sign({ sub: SERVER_ID, type: 'agent', jti: 'x' });
      expect(await service.verify(forged, SERVER_ID)).toEqual({ ok: false, reason: 'invalid' });

      const access = jwt.sign({ sub: SERVER_ID, type: 'access' });
      expect(await service.verify(access, SERVER_ID)).toEqual({ ok: false, reason: 'wrong_type' });

      expect(await service.verify(token, OTHER_ID)).toEqual({ ok: false, reason: 'wrong_server' });

      rows.delete(SERVER_ID);
      expect(await service.verify(token, SERVER_ID)).toEqual({ ok: false, reason: 'server_not_found' });
    });

    it('rechaza un token caducado', async () => {
      const { service, jwt } = setup({ agentTokenId: 'jti-old' });
      const expired = jwt.sign(
        { sub: SERVER_ID, type: 'agent', jti: 'jti-old', exp: Math.floor(Date.now() / 1000) - 10 },
      );
      expect(await service.verify(expired, SERVER_ID)).toEqual({ ok: false, reason: 'invalid' });
    });
  });

  describe('revocación', () => {
    it('revocar deja fuera el vigente, el pendiente, el anterior y los heredados', async () => {
      const { service, legacyToken, row } = setup({ agentTokenLegacy: true });
      const current = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });
      const pending = await service.beginRotation({ id: SERVER_ID, name: 'web-1' });

      await service.revoke(SERVER_ID);

      expect(row()).toMatchObject({
        agentTokenId: null,
        agentTokenPendingId: null,
        agentTokenPreviousId: null,
        agentTokenLegacy: false,
      });
      for (const token of [current, pending.token, legacyToken()]) {
        expect(await service.verify(token, SERVER_ID)).toEqual({ ok: false, reason: 'revoked' });
      }
    });

    it('una reinstalación deja solo el token nuevo, sin gracia para el anterior', async () => {
      const { service } = setup();
      const old = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });

      const install = await service.issueForInstall({ id: SERVER_ID, name: 'web-1' });
      // Mientras la instalación no termina, el agente que corría sigue valiendo.
      expect(await service.verify(old, SERVER_ID)).toMatchObject({ ok: true, slot: 'current' });

      await service.activate(SERVER_ID, install.jti);
      expect(await service.verify(old, SERVER_ID)).toEqual({ ok: false, reason: 'revoked' });
      expect(await service.verify(install.token, SERVER_ID)).toMatchObject({ ok: true, slot: 'current' });
    });
  });

  describe('rotación', () => {
    it('el vigente no cambia hasta el ACK; tras él, el anterior queda en gracia', async () => {
      const { service, row } = setup();
      const old = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });

      const next = await service.beginRotation({ id: SERVER_ID, name: 'web-1' });
      expect(row().agentTokenPendingId).toBe(next.jti);
      expect(await service.verify(old, SERVER_ID)).toMatchObject({ ok: true, slot: 'current' });

      // ACK: el agente presenta el token nuevo.
      const ack = await service.verify(next.token, SERVER_ID);
      expect(ack).toMatchObject({ ok: true, slot: 'pending' });
      expect(row().agentTokenId).toBe(next.jti);
      expect(row().agentTokenPendingId).toBeNull();

      expect(await service.verify(next.token, SERVER_ID)).toMatchObject({ ok: true, slot: 'current' });
      expect(await service.verify(old, SERVER_ID)).toMatchObject({ ok: true, slot: 'previous' });
    });

    it('pasada la gracia, el anterior se rechaza', async () => {
      const { service } = setup();
      const old = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });
      const next = await service.beginRotation({ id: SERVER_ID, name: 'web-1' });
      await service.verify(next.token, SERVER_ID);

      jest.useFakeTimers({ now: Date.now() + AGENT_TOKEN_GRACE_MS + 1_000, doNotFake: ['nextTick', 'setImmediate'] });
      expect(await service.verify(old, SERVER_ID)).toEqual({ ok: false, reason: 'revoked' });
      expect(await service.verify(next.token, SERVER_ID)).toMatchObject({ ok: true, slot: 'current' });
    });

    it('sin ACK (agente que no lo guardó) el pendiente se sustituye y el vigente sigue', async () => {
      const { service } = setup();
      const old = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });
      const lost = await service.beginRotation({ id: SERVER_ID, name: 'web-1' });
      const retry = await service.beginRotation({ id: SERVER_ID, name: 'web-1' });

      expect(await service.verify(old, SERVER_ID)).toMatchObject({ ok: true, slot: 'current' });
      expect(await service.verify(lost.token, SERVER_ID)).toEqual({ ok: false, reason: 'revoked' });
      expect(await service.verify(retry.token, SERVER_ID)).toMatchObject({ ok: true, slot: 'pending' });
    });

    it('confirmar una rotación que ya no está pendiente no cambia nada', async () => {
      const { service, row } = setup();
      await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });
      const current = row().agentTokenId;

      expect(await service.confirmRotation(SERVER_ID, 'jti-desconocido')).toBe(false);
      expect(row().agentTokenId).toBe(current);
      expect(row().agentTokenPreviousId).toBeNull();
    });

    it('pide rotar a los 7 días, o a un cuarto de su vida si es más corta', () => {
      const { service } = setup();
      const now = Date.now();
      const iat = Math.floor(now / 1000);
      const day = 86_400;

      expect(service.isDueForRotation({ jti: 'a', iat, exp: iat + 30 * day }, now)).toBe(false);
      expect(
        service.isDueForRotation({ jti: 'a', iat, exp: iat + 30 * day }, now + AGENT_TOKEN_ROTATE_AFTER_MS),
      ).toBe(true);
      // Vida de 1 día: rota a las 6 h.
      expect(service.isDueForRotation({ jti: 'a', iat, exp: iat + day }, now + 6 * 3_600_000)).toBe(true);
      // Heredado: siempre.
      expect(service.isDueForRotation({ iat, exp: iat + 365 * day }, now)).toBe(true);
    });
  });

  describe('tokens heredados (sin jti)', () => {
    it('se aceptan en la primera conexión, se fijan por huella y piden rotación', async () => {
      const { service, legacyToken, row } = setup({ agentTokenLegacy: true });
      const token = legacyToken();

      const check = await service.verify(token, SERVER_ID);
      expect(check).toMatchObject({ ok: true, slot: 'legacy', needsRotation: true });
      expect(row().agentTokenId).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(row().agentTokenLegacy).toBe(false);

      // Siguiente mensaje con el mismo token: ya es el vigente (por huella).
      expect(await service.verify(token, SERVER_ID)).toMatchObject({
        ok: true,
        slot: 'current',
        needsRotation: true,
      });
    });

    it('fijado uno, otro token heredado del mismo servidor deja de valer', async () => {
      const { service, jwt, legacyToken } = setup({ agentTokenLegacy: true });
      await service.verify(legacyToken(), SERVER_ID);

      const another = jwt.sign({ sub: SERVER_ID, type: 'agent', serverName: 'otro' }, { expiresIn: '365d' });
      expect(await service.verify(another, SERVER_ID)).toEqual({ ok: false, reason: 'revoked' });
    });

    it('migración completa: heredado → rotado al esquema nuevo, con gracia para el heredado', async () => {
      const { service, legacyToken, row, jwt } = setup({ agentTokenLegacy: true });
      const legacy = legacyToken();
      await service.verify(legacy, SERVER_ID);

      const next = await service.beginRotation({ id: SERVER_ID, name: 'web-1' });
      await service.verify(next.token, SERVER_ID); // ACK

      expect(row().agentTokenId).toBe(jwt.decode<{ jti: string }>(next.token).jti);
      expect(await service.verify(legacy, SERVER_ID)).toMatchObject({ ok: true, slot: 'previous' });
      expect(await service.verify(next.token, SERVER_ID)).toMatchObject({
        ok: true,
        slot: 'current',
        needsRotation: false,
      });
    });

    it('no se aceptan si el servidor ya no admite heredados', async () => {
      const { service, legacyToken } = setup({ agentTokenLegacy: false });
      expect(await service.verify(legacyToken(), SERVER_ID)).toEqual({ ok: false, reason: 'revoked' });
    });
  });

  it('un error de base de datos se propaga: no es un 401', async () => {
    const { service, repo } = setup();
    const token = await service.issueAndActivate({ id: SERVER_ID, name: 'web-1' });
    repo.createQueryBuilder.mockImplementation(() => {
      throw new Error('connection refused');
    });
    await expect(service.verify(token, SERVER_ID)).rejects.toThrow('connection refused');
  });
});
