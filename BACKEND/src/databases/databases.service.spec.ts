import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { DatabasesService } from '@/databases/databases.service';
import { DatabaseSessionService } from '@/databases/services/database-session.service';
import {
  DatabaseEngine,
  DatabaseSshAuth,
  DatabaseSshMode,
  type DatabaseConnection,
} from '@/databases/entities/database-connection.entity';
import type { Server } from '@servers/entities/server.entity';
import type { DatabaseTunnelService } from '@/databases/services/database-tunnel.service';
import type { DatabaseQueryAudit } from '@/databases/entities/database-query-audit.entity';
import type { CredentialsCipherService } from '@/databases/services/credentials-cipher.service';
import type { DatabaseProbeService } from '@/databases/services/database-probe.service';
import type { DatabaseExplorerService } from '@/databases/services/database-explorer.service';
import type { RedisExplorerService } from '@/databases/services/redis-explorer.service';

const OWNER = 'user-a';
const CONN = '00000000-0000-4000-8000-00000000000a';
const SESSION = '00000000-0000-4000-8000-0000000000aa';

describe('DatabasesService.closeSession', () => {
  const existsBy = jest.fn<Promise<boolean>, [unknown]>();
  const close = jest.fn<Promise<void>, [string, string, string?]>(() => Promise.resolve());
  const service = new DatabasesService(
    { existsBy } as unknown as Repository<DatabaseConnection>,
    {} as Repository<DatabaseQueryAudit>,
    {} as CredentialsCipherService,
    {} as DatabaseProbeService,
    {} as DatabaseExplorerService,
    { close } as unknown as DatabaseSessionService,
    {} as RedisExplorerService,
    {} as Repository<Server>,
    {} as DatabaseTunnelService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('con una conexión ajena o inexistente responde 404 y no toca ninguna sesión', async () => {
    existsBy.mockResolvedValue(false);
    await expect(service.closeSession('user-b', CONN, SESSION)).rejects.toBeInstanceOf(NotFoundException);
    expect(existsBy).toHaveBeenCalledWith({ id: CONN, userId: 'user-b' });
    expect(close).not.toHaveBeenCalled();
  });

  it('el dueño cierra la sesión de esa conexión', async () => {
    existsBy.mockResolvedValue(true);
    await service.closeSession(OWNER, CONN, SESSION);
    expect(close).toHaveBeenCalledWith(OWNER, SESSION, CONN);
  });
});

describe('DatabasesService: túnel SSH al guardar', () => {
  const FINGERPRINT = 'SHA256:' + 'A'.repeat(43);
  const serverExists = jest.fn<Promise<boolean>, [unknown]>();
  const repo = {
    create: (v: Partial<DatabaseConnection>) => ({ ...v }),
    save: (v: DatabaseConnection) => Promise.resolve({ ...v, id: CONN, createdAt: new Date() }),
  };
  const cipher = { encrypt: (v: string) => `enc:${v}` };
  const service = new DatabasesService(
    repo as unknown as Repository<DatabaseConnection>,
    {} as Repository<DatabaseQueryAudit>,
    cipher as unknown as CredentialsCipherService,
    {} as DatabaseProbeService,
    {} as DatabaseExplorerService,
    {} as DatabaseSessionService,
    {} as RedisExplorerService,
    { existsBy: serverExists } as unknown as Repository<Server>,
    {} as DatabaseTunnelService,
  );
  const base = { engine: DatabaseEngine.POSTGRESQL, name: 'db', host: '127.0.0.1', port: 5432, username: 'postgres' };
  const custom = {
    ...base,
    sshMode: DatabaseSshMode.CUSTOM,
    sshHost: 'bastion.example.com',
    sshPort: 22,
    sshUsername: 'deploy',
    sshAuth: DatabaseSshAuth.PASSWORD,
    sshSecret: 'secreta',
    sshHostKeyFingerprint: FINGERPRINT,
    sshHostKeyAlgorithm: 'ssh-ed25519',
  };

  beforeEach(() => jest.clearAllMocks());

  it('sin túnel guarda el modo none', async () => {
    const res = await service.create(OWNER, base);
    expect(res.sshMode).toBe(DatabaseSshMode.NONE);
    expect(res.hasSshSecret).toBe(false);
  });

  it('con credenciales propias cifra el secreto y fija la huella', async () => {
    const res = await service.create(OWNER, custom);
    expect(res).toMatchObject({ sshMode: 'custom', sshHost: 'bastion.example.com', hasSshSecret: true, sshHostKeyFingerprint: FINGERPRINT });
  });

  it('con credenciales propias exige la huella confirmada y el secreto', async () => {
    await expect(service.create(OWNER, { ...custom, sshHostKeyFingerprint: undefined })).rejects.toThrow('Confirma la huella');
    await expect(service.create(OWNER, { ...custom, sshSecret: undefined })).rejects.toThrow('contraseña SSH');
  });

  it('rechaza una llave privada que no se puede leer', async () => {
    await expect(
      service.create(OWNER, { ...custom, sshAuth: DatabaseSshAuth.KEY, sshSecret: '-----BEGIN OPENSSH PRIVATE KEY-----\nxx\n-----END OPENSSH PRIVATE KEY-----' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('por un servidor solo admite uno del propio usuario', async () => {
    serverExists.mockResolvedValue(false);
    const serverId = '00000000-0000-4000-8000-0000000000ff';
    await expect(service.create(OWNER, { ...base, sshMode: DatabaseSshMode.SERVER, sshServerId: serverId }))
      .rejects.toThrow('Elige uno de tus servidores');
    expect(serverExists).toHaveBeenCalledWith({ id: serverId, ownerId: OWNER });
    serverExists.mockResolvedValue(true);
    const res = await service.create(OWNER, { ...base, sshMode: DatabaseSshMode.SERVER, sshServerId: serverId });
    expect(res).toMatchObject({ sshMode: 'server', sshServerId: serverId, sshHost: null, hasSshSecret: false });
  });
});

describe('DatabaseSessionService.close', () => {
  const sessions = new DatabaseSessionService();
  type Internals = { sessions: Map<string, unknown>; dispose: (s: unknown) => Promise<void> };
  const internals = sessions as unknown as Internals;
  let dispose: jest.SpyInstance;

  beforeEach(() => {
    internals.sessions.set(SESSION, { id: SESSION, userId: OWNER, connectionId: CONN });
    dispose = jest.spyOn(internals, 'dispose').mockResolvedValue(undefined);
  });

  afterEach(() => {
    dispose.mockRestore();
    internals.sessions.clear();
  });

  afterAll(() => sessions.onModuleDestroy());

  it('no cierra la sesión de otro usuario', async () => {
    await sessions.close('user-b', SESSION, CONN);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('no cierra una sesión que pertenece a otra conexión del mismo usuario', async () => {
    await sessions.close(OWNER, SESSION, '00000000-0000-4000-8000-00000000000b');
    expect(dispose).not.toHaveBeenCalled();
  });

  it('cierra la sesión del dueño en su conexión', async () => {
    await sessions.close(OWNER, SESSION, CONN);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
