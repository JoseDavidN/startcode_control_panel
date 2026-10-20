import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { AuthResponseDto } from '@auth/dto/auth-response.dto';

/* Sin esperas reales en el retardo progresivo. */
jest.mock('@auth/login-attempts', () => ({
  ...jest.requireActual<typeof import('@auth/login-attempts')>('@auth/login-attempts'),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

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
  let configValues: Record<string, string>;

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

    configValues = {
      JWT_EXPIRES_IN: '30m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      AGENT_TOKEN_EXPIRES_IN: '30d',
      AUTH_ALLOW_REGISTRATION: 'true',
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
            get: jest.fn((key: string, defaultValue?: string) => configValues[key] ?? defaultValue),
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

    it('con un email inexistente compara contra un hash señuelo (tiempo constante)', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ email: 'no@existe.com', password: 'x' })).rejects.toThrow('Credenciales inválidas');
      expect(bcrypt.compare).toHaveBeenCalledWith('x', expect.stringMatching(/^\$2[aby]\$12\$/));
    });

    it('mismo mensaje si el usuario no existe o la contraseña es incorrecta', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      usersRepo.findOne.mockResolvedValue(null);
      const missing = await service.login({ email: 'no@existe.com', password: 'x' }).catch((e: Error) => e.message);
      usersRepo.findOne.mockResolvedValue(mockUser);
      const wrong = await service.login({ email: mockUser.email, password: 'x' }).catch((e: Error) => e.message);

      expect(missing).toBe(wrong);
    });

    it('a un usuario inactivo con contraseña incorrecta no le revela que está inactivo', async () => {
      usersRepo.findOne.mockResolvedValue({ ...mockUser, isActive: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ email: mockUser.email, password: 'x' })).rejects.toThrow('Credenciales inválidas');
    });

    it('bloquea también los emails que no existen, con el mismo mensaje que una cuenta real', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      for (let i = 0; i < 5; i++) {
        await expect(service.login({ email: 'no@existe.com', password: 'x' })).rejects.toThrow('Credenciales inválidas');
      }
      (bcrypt.compare as jest.Mock).mockClear();

      await expect(service.login({ email: 'No@Existe.com', password: 'x' })).rejects.toThrow(/bloqueada temporalmente/);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('bloquea la cuenta real tras 5 fallos aunque luego acierte', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      for (let i = 0; i < 5; i++) {
        await service.login({ email: mockUser.email, password: 'x' }).catch(() => undefined);
      }

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.login({ email: mockUser.email, password: 'ok' })).rejects.toThrow(/bloqueada temporalmente/);
    });

    it('bloquea la IP con 429 tras muchos fallos contra cuentas distintas', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const client = { remoteIp: '203.0.113.9' };

      for (let i = 0; i < 30; i++) {
        await service.login({ email: `u${i}@x.co`, password: 'x' }, client).catch(() => undefined);
      }

      const error = await service.login({ email: 'otro@x.co', password: 'x' }, client).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);

      /* Otra IP sigue pudiendo entrar. */
      await expect(service.login({ email: 'otro@x.co', password: 'x' }, { remoteIp: '198.51.100.1' })).rejects.toThrow(
        'Credenciales inválidas',
      );
    });
  });

  describe('register', () => {
    it('está deshabilitado salvo AUTH_ALLOW_REGISTRATION=true', async () => {
      delete configValues.AUTH_ALLOW_REGISTRATION;

      await expect(
        service.register({ firstname: 'Jane', lastname: 'Doe', email: 'jane@example.com', password: 'Clave123!' }),
      ).rejects.toThrow(ForbiddenException);
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

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
    it('firma el token con type=agent, sub=serverId y un jti revocable', () => {
      service.generateAgentToken('server-uuid-1', 'Mi Servidor', 'jti-1');

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'server-uuid-1', type: 'agent', serverName: 'Mi Servidor', jti: 'jti-1' },
        expect.objectContaining({ expiresIn: '30d' }),
      );
    });

    it('sin jti explícito genera uno distinto en cada token', () => {
      service.generateAgentToken('server-uuid-1', 'Mi Servidor');
      service.generateAgentToken('server-uuid-1', 'Mi Servidor');

      const calls = jwtService.sign.mock.calls as [{ jti?: string }][];
      const [first, second] = calls.slice(-2).map(([payload]) => payload.jti);
      expect(first).toEqual(expect.any(String));
      expect(first).not.toBe(second);
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

    const liveSession = (token: string, extra: Partial<Session> = {}) => ({
      id: 'session-uuid-1',
      userId: mockUser.id,
      revoked: false,
      persistent: false,
      expiresAt: new Date(Date.now() + 60_000),
      refreshHash: createHash('sha256').update(token).digest('hex'),
      ...extra,
    });

    it('rota el refresh: el token anterior deja de valer', async () => {
      jwtService.verify.mockReturnValue({ sub: mockUser.id, type: 'refresh', sid: 'session-uuid-1' });
      usersRepo.findOne.mockResolvedValue(mockUser);
      sessionsRepo.findOne.mockResolvedValue(liveSession('otro.refresh.token'));

      await expect(service.refreshToken('viejo.refresh.token')).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza el refresh de una sesión revocada (logout)', async () => {
      jwtService.verify.mockReturnValue({ sub: mockUser.id, type: 'refresh', sid: 'session-uuid-1' });
      usersRepo.findOne.mockResolvedValue(mockUser);
      sessionsRepo.findOne.mockResolvedValue(liveSession('t', { revoked: true }));

      await expect(service.refreshToken('t')).rejects.toThrow(UnauthorizedException);
    });

    it.each([
      ['borrado', null],
      ['desactivado', { ...mockUser, isActive: false }],
    ])('rechaza el refresh de un usuario %s', async (_label, user) => {
      jwtService.verify.mockReturnValue({ sub: mockUser.id, type: 'refresh', sid: 'session-uuid-1' });
      usersRepo.findOne.mockResolvedValue(user);
      sessionsRepo.findOne.mockResolvedValue(liveSession('t'));

      await expect(service.refreshToken('t')).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza un token de acceso usado como refresh', async () => {
      jwtService.verify.mockReturnValue({ sub: mockUser.id, type: 'access', sid: 'session-uuid-1' });

      await expect(service.refreshToken('t')).rejects.toThrow(UnauthorizedException);
    });

    it('bloquea con 429 la IP que prueba refresh inválidos', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const client = { remoteIp: '203.0.113.7' };
      for (let i = 0; i < 30; i++) {
        await service.refreshToken('bad', client).catch(() => undefined);
      }

      const error = await service.refreshToken('bad', client).catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(429);
    });

    it('limita las renovaciones por cuenta', async () => {
      jwtService.verify.mockReturnValue({ sub: mockUser.id, type: 'refresh', sid: 'session-uuid-1' });
      usersRepo.findOne.mockResolvedValue(mockUser);
      sessionsRepo.findOne.mockResolvedValue(liveSession('t'));

      const results: number[] = [];
      for (let i = 0; i < 31; i++) {
        results.push(await service.refreshToken('t').then(() => 200, (e: HttpException) => e.getStatus()));
      }
      expect(results.slice(0, 29).every(status => status === 200)).toBe(true);
      expect(results.at(-1)).toBe(429);
    });
  });
});
