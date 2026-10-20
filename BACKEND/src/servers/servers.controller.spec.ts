import { Test, TestingModule } from '@nestjs/testing';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { AuthService } from '@auth/auth.service';
import { AgentInstallService } from '@servers/services/agent-install.service';
import { HostKeyService } from '@servers/services/host-key.service';
import type { AuthenticatedRequest } from '@auth/types/authenticated-request.type';

const mockServersService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  updatePrivateKey: jest.fn(),
  updateStatus: jest.fn(),
  getStats: jest.fn(),
  search: jest.fn(),
  filterByStatus: jest.fn(),
  filterByOS: jest.fn(),
};

const mockAuthService = {
  login: jest.fn(),
  logout: jest.fn(),
  refreshToken: jest.fn(),
  validateToken: jest.fn(),
  getMe: jest.fn(),
};

const mockAgentInstallService = {
  install: jest.fn(),
  uninstall: jest.fn(),
};

const mockHostKeyService = {
  accept: jest.fn(),
};

describe('ServersController', () => {
  let controller: ServersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServersController],
      providers: [
        { provide: ServersService, useValue: mockServersService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AgentInstallService, useValue: mockAgentInstallService },
        { provide: HostKeyService, useValue: mockHostKeyService },
      ],
    }).compile();

    controller = module.get<ServersController>(ServersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST :id/host-key/accept delega en HostKeyService con el usuario y la huella vista', async () => {
    const result = { serverId: 's1', hostKeyFingerprint: 'SHA256:x' };
    mockHostKeyService.accept.mockResolvedValue(result);
    const req = { user: { id: 'u1' } } as AuthenticatedRequest;
    await expect(controller.acceptHostKey('s1', { fingerprint: 'SHA256:x' }, req)).resolves.toBe(result);
    expect(mockHostKeyService.accept).toHaveBeenCalledWith('s1', req.user, 'SHA256:x');
  });
});
