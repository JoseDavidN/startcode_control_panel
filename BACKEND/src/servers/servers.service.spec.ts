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
import { CredentialsCipherService } from '@/databases/services/credentials-cipher.service';

const mockUser: User = {
  id: 'user-uuid-1',
  firstname: 'John',
  lastname: 'Doe',
  email: 'john@example.com',
  password: 'hashed',
  role: UserRole.USER,
  isActive: true,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  twoFactorLastStep: null,
  twoFactorBackupCodes: null,
  backupCodesGeneratedAt: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  preferences: null,
  servers: [],
  lastLogin: new Date('2024-01-01'),
  passwordChangedAt: new Date('2024-01-01'),
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
  tag: null,
  favoritedAt: null,
  description: null,
  metadata: null,
  lastSeen: null,
  hostname: null,
  osVersion: null,
  kernelVersion: null,
  hostKeyAlgorithm: null,
  hostKeyFingerprint: null,
  hostKeyVerifiedAt: null,
  owner: mockUser,
  ownerId: mockUser.id,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  lastCheckAt: null,
  agentTokenId: null,
  agentTokenPendingId: null,
  agentTokenPreviousId: null,
  agentTokenPreviousUntil: null,
  agentTokenIssuedAt: null,
  agentTokenLegacy: false,
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
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServersService,
        { provide: getRepositoryToken(Server), useValue: serversRepo },
        /* Cifrado de prueba con el mismo prefijo `v1:` que el real. */
        {
          provide: CredentialsCipherService,
          useValue: {
            ready: true,
            encrypt: jest.fn((v: string) => `v1:enc:${v}`),
            decrypt: jest.fn((v: string) => v.replace(/^v1:enc:/, '')),
          },
        },
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

    it('crea el servidor con estado PENDING (aún sin agente)', async () => {
      serversRepo.findOne.mockResolvedValue(null);
      serversRepo.create.mockReturnValue(mockServer);
      serversRepo.save.mockResolvedValue(mockServer);

      await service.create(createServerDto, mockUser);

      expect(serversRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ServerStatus.PENDING }),
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

  describe('llave privada SSH cifrada', () => {
    it('create guarda la llave cifrada, nunca en claro', async () => {
      serversRepo.findOne.mockResolvedValue(null);
      serversRepo.create.mockReturnValue(mockServer);
      serversRepo.save.mockResolvedValue(mockServer);
      await service.create(createServerDto, mockUser);
      expect(serversRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ privateKey: 'v1:enc:---private key---' }),
      );
    });

    it('findOneWithPrivateKey la devuelve descifrada para conectar', async () => {
      serversRepo.findOne.mockResolvedValue({ ...mockServer, privateKey: 'v1:enc:LLAVE' });
      const server = await service.findOneWithPrivateKey(mockServer.id, mockUser.id);
      expect(server.privateKey).toBe('LLAVE');
    });

    it('una llave antigua en claro se sigue usando tal cual', async () => {
      serversRepo.findOne.mockResolvedValue({ ...mockServer, privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----' });
      const server = await service.findOneWithPrivateKey(mockServer.id, mockUser.id);
      expect(server.privateKey).toBe('-----BEGIN OPENSSH PRIVATE KEY-----');
    });

    it('updatePrivateKey escribe solo la llave cifrada', async () => {
      serversRepo.findOne.mockResolvedValue(mockServer);
      await service.updatePrivateKey(mockServer.id, { privateKey: 'NUEVA' }, mockUser);
      expect(serversRepo.update).toHaveBeenCalledWith(
        { id: mockServer.id },
        expect.objectContaining({ privateKey: 'v1:enc:NUEVA' }),
      );
      expect(serversRepo.save).not.toHaveBeenCalled();
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

  describe('setFavorite', () => {
    it('marca un favorito si hay menos de 3', async () => {
      serversRepo.findOne.mockResolvedValue({ ...mockServer, favoritedAt: null });
      serversRepo.count.mockResolvedValue(2);
      const res = await service.setFavorite(mockServer.id, true, mockUser);
      expect(serversRepo.update).toHaveBeenCalledWith({ id: mockServer.id }, { favoritedAt: expect.any(Date) as Date });
      expect(res.favoritedAt).toBeInstanceOf(Date);
    });

    it('rechaza el cuarto favorito con 409', async () => {
      serversRepo.findOne.mockResolvedValue({ ...mockServer, favoritedAt: null });
      serversRepo.count.mockResolvedValue(3);
      await expect(service.setFavorite(mockServer.id, true, mockUser)).rejects.toThrow(ConflictException);
      expect(serversRepo.update).not.toHaveBeenCalled();
    });

    it('quitar un favorito no cuenta los demás', async () => {
      serversRepo.findOne.mockResolvedValue({ ...mockServer, favoritedAt: new Date() });
      const res = await service.setFavorite(mockServer.id, false, mockUser);
      expect(serversRepo.count).not.toHaveBeenCalled();
      expect(serversRepo.update).toHaveBeenCalledWith({ id: mockServer.id }, { favoritedAt: null });
      expect(res.favoritedAt).toBeNull();
    });

    it('no toca nada si ya está en ese estado', async () => {
      serversRepo.findOne.mockResolvedValue({ ...mockServer, favoritedAt: new Date() });
      await service.setFavorite(mockServer.id, true, mockUser);
      expect(serversRepo.update).not.toHaveBeenCalled();
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
