import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { AuthResponseDto } from '@auth/dto/auth-response.dto';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './entities/user.entity';
import { Session } from '@auth/entities/session.entity';

const mockUser: User = {
  id: 'user-uuid-1',
  firstname: 'John',
  lastname: 'Doe',
  email: 'john@example.com',
  password: '$2b$12$hashed_password',
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
  /* Reciente: con la caducidad por defecto (90 días) el login pediría cambiarla. */
  passwordChangedAt: new Date(),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/** El login y el registro emiten tokens de sesión: cualquier otra respuesta es un fallo. */
function asSession(result: object): AuthResponseDto {
  if (!('token' in result)) throw new Error('Se esperaba una sesión emitida');
  return result as AuthResponseDto;
}

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: Record<string, jest.Mock>;
  let sessionsRepo: Record<string, jest.Mock>;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    usersRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    sessionsRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((data: Partial<Session>) => data),
      save: jest.fn((data: Partial<Session>) => Promise.resolve({ ...data, id: 'session-uuid-1' })),
      update: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('signed.jwt.token'),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Session), useValue: sessionsRepo },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const values: Record<string, string> = {
                JWT_EXPIRES_IN: '30m',
                JWT_REFRESH_EXPIRES_IN: '7d',
                AGENT_TOKEN_EXPIRES_IN: '365d',
              };
              return values[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('retorna token con credenciales válidas', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = asSession(
        await service.login({
          email: mockUser.email,
          password: 'correct_password',
        }),
      );

      expect(result.token).toBe('signed.jwt.token');
      expect(result.user.email).toBe(mockUser.email);
      expect(result.user.id).toBe(mockUser.id);
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'no@existe.com', password: 'cualquiera' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: mockUser.email, password: 'incorrecta' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario está inactivo', async () => {
      usersRepo.findOne.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        service.login({ email: mockUser.email, password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('lanza ConflictException si el email ya existe', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);

      await expect(
        service.register({
          firstname: 'Jane',
          lastname: 'Doe',
          email: mockUser.email,
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('crea el usuario y retorna token cuando el email es nuevo', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      usersRepo.create.mockReturnValue(mockUser);
      usersRepo.save.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_pw');

      const result = await service.register({
        firstname: 'Jane',
        lastname: 'Doe',
        email: 'jane@example.com',
        password: 'password123',
      });

      expect(usersRepo.save).toHaveBeenCalledTimes(1);
      expect(result.token).toBe('signed.jwt.token');
    });
  });

  describe('generateAgentToken', () => {
    it('firma el token con type=agent y sub=serverId', () => {
      service.generateAgentToken('server-uuid-1', 'Mi Servidor');

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'server-uuid-1', type: 'agent', serverName: 'Mi Servidor' },
        expect.objectContaining({ expiresIn: '365d' }),
      );
    });

    it('retorna el token firmado', () => {
      const token = service.generateAgentToken('server-uuid-1', 'Mi Servidor');
      expect(token).toBe('signed.jwt.token');
    });
  });

  describe('refreshToken', () => {
    it('lanza UnauthorizedException con un token inválido', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(service.refreshToken('bad.token.here')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('retorna nuevos tokens con refresh token válido', async () => {
      jwtService.verify.mockReturnValue({ sub: mockUser.id, type: 'refresh', sid: 'session-uuid-1' });
      usersRepo.findOne.mockResolvedValue(mockUser);
      sessionsRepo.findOne.mockResolvedValue({
        id: 'session-uuid-1',
        userId: mockUser.id,
        revoked: false,
        persistent: false,
        expiresAt: new Date(Date.now() + 60_000),
        refreshHash: createHash('sha256').update('valid.refresh.token').digest('hex'),
      });

      const result = await service.refreshToken('valid.refresh.token');

      expect(result.token).toBe('signed.jwt.token');
      expect(result.user.id).toBe(mockUser.id);
    });
  });
});
