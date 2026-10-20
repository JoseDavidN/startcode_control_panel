import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { DatabasesService } from '@/databases/databases.service';
import { DatabaseSessionService } from '@/databases/services/database-session.service';
import type { DatabaseConnection } from '@/databases/entities/database-connection.entity';
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
