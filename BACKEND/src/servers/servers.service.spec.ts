import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServersService } from './servers.service';
import { Server, ServerOs, ServerStatus } from './entities/server.entity';
import { User, UserRole } from '@auth/entities/user.entity';

const mockUser: User = {
  id: 'user-uuid-1',
  firstname: 'John',
  lastname: 'Doe',
  email: 'john@example.com',
  password: 'hashed',
  role: UserRole.USER,
  isActive: true,
  servers: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockServer: Server = {
  id: 'server-uuid-1',
  name: 'Producción',
  host: '192.168.1.100',
  port: 22,
  username: 'ubuntu',
  privateKey: '---BEGIN RSA PRIVATE KEY---',
  status: ServerStatus.OFFLINE,
  os: ServerOs.UBUNTU,
  description: null,
  metadata: null,
  lastSeen: null,
  hostname: null,
  osVersion: null,
  kernelVersion: null,
  owner: mockUser,
  ownerId: mockUser.id,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  lastCheckAt: null,
};

const createServerDto = {
  name: 'Test Server',
  host: '10.0.0.1',
  port: 22,
  username: 'ubuntu',
  os: ServerOs.UBUNTU,
  privateKey: '---private key---',
};

describe('ServersService', () => {
  let service: ServersService;
  let serversRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    serversRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServersService,
        { provide: getRepositoryToken(Server), useValue: serversRepo },
      ],
    }).compile();

    service = module.get<ServersService>(ServersService);
  });

  describe('create', () => {
    it('lanza ConflictException si el host ya existe para el usuario', async () => {
      serversRepo.findOne.mockResolvedValue(mockServer);

      await expect(
        service.create({ ...createServerDto, host: mockServer.host }, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('crea el servidor con estado OFFLINE', async () => {
      serversRepo.findOne.mockResolvedValue(null);
      serversRepo.create.mockReturnValue(mockServer);
      serversRepo.save.mockResolvedValue(mockServer);

      await service.create(createServerDto, mockUser);

      expect(serversRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ServerStatus.OFFLINE }),
      );
      expect(serversRepo.save).toHaveBeenCalledTimes(1);
    });

    it('asigna el owner_id del usuario que crea el servidor', async () => {
      serversRepo.findOne.mockResolvedValue(null);
      serversRepo.create.mockReturnValue(mockServer);
      serversRepo.save.mockResolvedValue(mockServer);

      await service.create(createServerDto, mockUser);

      expect(serversRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: mockUser.id }),
      );
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si el servidor no existe', async () => {
      serversRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si el usuario no es propietario', async () => {
      serversRepo.findOne.mockResolvedValue({
        ...mockServer,
        ownerId: 'otro-usuario-uuid',
      });

      await expect(service.findOne(mockServer.id, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('retorna el DTO del servidor cuando el usuario es propietario', async () => {
      serversRepo.findOne.mockResolvedValue(mockServer);

      const result = await service.findOne(mockServer.id, mockUser);

      expect(result.id).toBe(mockServer.id);
      expect(result.host).toBe(mockServer.host);
    });
  });

  describe('remove', () => {
    it('llama a repository.remove con el servidor correcto', async () => {
      serversRepo.findOne.mockResolvedValue(mockServer);
      serversRepo.remove.mockResolvedValue(mockServer);

      await service.remove(mockServer.id, mockUser);

      expect(serversRepo.remove).toHaveBeenCalledWith(mockServer);
    });

    it('retorna mensaje de confirmación', async () => {
      serversRepo.findOne.mockResolvedValue(mockServer);
      serversRepo.remove.mockResolvedValue(mockServer);

      const result = await service.remove(mockServer.id, mockUser);

      expect(result.message).toContain('eliminado');
    });
  });

  describe('getStats', () => {
    it('cuenta correctamente servidores por estado', async () => {
      serversRepo.find.mockResolvedValue([
        { status: ServerStatus.ONLINE },
        { status: ServerStatus.ONLINE },
        { status: ServerStatus.OFFLINE },
        { status: ServerStatus.ERROR },
        { status: ServerStatus.MAINTENANCE },
        { status: ServerStatus.CHECKING },
      ]);

      const stats = await service.getStats(mockUser);

      expect(stats.total).toBe(6);
      expect(stats.online).toBe(2);
      expect(stats.offline).toBe(1);
      expect(stats.error).toBe(1);
      expect(stats.maintenance).toBe(1);
      expect(stats.checking).toBe(1);
    });

    it('retorna ceros cuando no hay servidores', async () => {
      serversRepo.find.mockResolvedValue([]);

      const stats = await service.getStats(mockUser);

      expect(stats.total).toBe(0);
      expect(stats.online).toBe(0);
    });
  });

  describe('verifyOwnership', () => {
    it('retorna true cuando el usuario es propietario', async () => {
      serversRepo.findOne.mockResolvedValue({ ownerId: mockUser.id });

      const result = await service.verifyOwnership(mockServer.id, mockUser.id);

      expect(result).toBe(true);
    });

    it('retorna false cuando el servidor no existe', async () => {
      serversRepo.findOne.mockResolvedValue(null);

      const result = await service.verifyOwnership('nonexistent', mockUser.id);

      expect(result).toBe(false);
    });

    it('retorna false cuando el propietario es diferente', async () => {
      serversRepo.findOne.mockResolvedValue({ ownerId: 'otro-usuario-id' });

      const result = await service.verifyOwnership(mockServer.id, mockUser.id);

      expect(result).toBe(false);
    });
  });
});
