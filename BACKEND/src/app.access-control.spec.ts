import { INestApplication, RequestMethod, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from '@/app.controller';
import { AssistantController } from '@/assistant/assistant.controller';
import { AuthController } from '@auth/auth.controller';
import { User } from '@auth/entities/user.entity';
import { Session } from '@auth/entities/session.entity';
import { JwtStrategy } from '@auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '@auth/jwt-auth/jwt-auth.guard';
import { DatabasesController } from '@/databases/databases.controller';
import { AgentDataController } from '@monitoring/agent-data.controller';
import { NotificationsController } from '@/notifications/notifications.controller';
import { AgentController } from '@servers/agent.controller';
import { AgentReleasesController } from '@servers/agent-releases.controller';
import { ServersController } from '@servers/servers.controller';
import { AgentInstallTokenGuard } from '@servers/guards/agent-install-token.guard';
import { SftpController } from '@/sftp/sftp.controller';

/**
 * Control de acceso de toda la API HTTP.
 *
 * Recorre las rutas reales de cada controlador (por sus metadatos, así que una
 * ruta nueva entra sola en el test) con los guards de verdad y los servicios
 * simulados. Lo que se comprueba es la puerta, no la lógica de cada servicio:
 * solo las rutas de `PUBLIC` responden sin token, y ninguna protegida acepta
 * un token ausente, mal formado, caducado, firmado con otro secreto, de otro
 * tipo o de una sesión revocada.
 */

const SECRET = 'test-secret-access-control-0123456789abcdef0123456789';
const PREFIX = '/api/v1';
const UUID = '00000000-0000-4000-8000-000000000001';

const CONTROLLERS: Type[] = [
  AppController,
  AssistantController,
  AuthController,
  DatabasesController,
  AgentDataController,
  NotificationsController,
  AgentController,
  AgentReleasesController,
  ServersController,
  SftpController,
];

/** Rutas que deben funcionar sin sesión. Cualquier otra que lo haga es un fallo. */
const PUBLIC = new Set([
  'GET /api/v1',
  'GET /api/v1/health',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/2fa/verify-login',
  'POST /api/v1/auth/change-expired-password',
  'POST /api/v1/auth/refresh',
]);

type Verb = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface Route { verb: Verb; path: string; key: string }

const VERBS: Partial<Record<RequestMethod, Verb>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

function routesOf(controller: Type): Route[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).flatMap((name) => {
    const handler = proto[name];
    if (typeof handler !== 'function' || name === 'constructor') return [];
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
    const verb = method === undefined ? undefined : VERBS[method];
    if (!verb || sub === undefined) return [];
    const path = [PREFIX, base, sub]
      .map((p) => p.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/');
    const real = `/${path}`.replace(/:[A-Za-z]+/g, (p) => (p === ':pid' ? '123' : p === ':serviceName' ? 'nginx' : p === ':schema' ? 'public' : UUID));
    return [{ verb, path: real, key: `${verb.toUpperCase()} /${path}`.replace(/:[A-Za-z]+/g, ':p') }];
  });
}

/** Cada dependencia que no se declara es un objeto cuyas funciones devuelven `undefined`. */
function autoMock(): unknown {
  const fns: Record<string | symbol, jest.Mock> = {};
  return new Proxy(fns, {
    get: (target, prop) => {
      if (prop === 'then') return undefined;
      target[prop] ??= jest.fn();
      return target[prop];
    },
  });
}

describe('Control de acceso de la API', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let session: Partial<Session> | null;
  const user = { id: UUID, isActive: true, preferences: null } as unknown as User;

  const routes = CONTROLLERS.flatMap(routesOf);
  const protectedRoutes = routes.filter((r) => !PUBLIC.has(r.key));

  const access = (claims: Record<string, unknown> = {}, opts: { secret?: string; expiresIn?: number } = {}) =>
    jwt.sign(
      { sub: UUID, email: 'a@b.c', role: 'user', type: 'access', sid: 'sid-1', ...claims },
      { secret: opts.secret ?? SECRET, expiresIn: opts.expiresIn ?? 300 },
    );

  beforeAll(async () => {
    const config = {
      get: (key: string, fallback?: unknown) => (key === 'JWT_SECRET' ? SECRET : fallback),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: SECRET })],
      controllers: CONTROLLERS,
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        AgentInstallTokenGuard,
        { provide: ConfigService, useValue: config },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(() => Promise.resolve(user)) } },
        {
          provide: getRepositoryToken(Session),
          useValue: { findOne: jest.fn(() => Promise.resolve(session)), update: jest.fn() },
        },
      ],
    })
      .useMocker(autoMock)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    session = {
      id: 'sid-1',
      userId: UUID,
      revoked: false,
      persistent: true,
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsed: new Date(),
    };
  });

  const call = (route: Route, token?: string) => {
    const req = request(app.getHttpServer())[route.verb](route.path);
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  };

  it('descubre las rutas de todos los controladores', () => {
    expect(routes.length).toBeGreaterThan(80);
    for (const key of PUBLIC) expect(routes.map((r) => r.key)).toContain(key);
  });

  it('sin token, solo las rutas públicas dejan pasar', async () => {
    const open: string[] = [];
    for (const route of routes) {
      const res = await call(route);
      if (res.status !== 401) open.push(route.key);
    }
    expect(open.sort()).toEqual([...PUBLIC].sort());
  });

  const invalid: [string, () => string][] = [
    ['mal formado', () => 'no-es-un-jwt'],
    ['caducado', () => access({}, { expiresIn: -10 })],
    ['firmado con otro secreto', () => access({}, { secret: 'otro-secreto-de-al-menos-32-caracteres-xxxxxxxx' })],
    ['de refresco', () => access({ type: 'refresh' })],
    ['de agente', () => access({ type: 'agent' })],
    ['de instalación del agente', () => access({ type: 'agent-install' })],
    ['de 2FA pendiente', () => access({ type: '2fa' })],
    ['sin sesión', () => access({ sid: undefined })],
  ];

  /* El token de instalación es justo la credencial de `agent-releases`; fuera de ahí no vale. */
  const releases = (r: Route) => r.path.startsWith(`${PREFIX}/agent-releases/`);

  it.each(invalid)('token %s: todas las rutas protegidas responden 401', async (label, make) => {
    const token = make();
    const leaked: string[] = [];
    const targets = label === 'de instalación del agente' ? protectedRoutes.filter((r) => !releases(r)) : protectedRoutes;
    for (const route of targets) {
      const res = await call(route, token);
      if (res.status !== 401) leaked.push(`${route.key} → ${res.status}`);
    }
    expect(leaked).toEqual([]);
  });

  it('token de una sesión revocada: 401 en todas las rutas protegidas', async () => {
    const token = access();
    const leaked: string[] = [];
    for (const route of protectedRoutes) {
      session = { ...session, revoked: true };
      const res = await call(route, token);
      if (res.status !== 401) leaked.push(`${route.key} → ${res.status}`);
    }
    expect(leaked).toEqual([]);
  });

  it('token de una sesión de otro usuario: 401', async () => {
    session = { ...session, userId: '00000000-0000-4000-8000-000000000002' };
    const res = await request(app.getHttpServer())
      .get(`${PREFIX}/notifications/unread-count`)
      .set('Authorization', `Bearer ${access()}`);
    expect(res.status).toBe(401);
  });

  it('un token de acceso válido no sirve para descargar el agente', async () => {
    const res = await request(app.getHttpServer())
      .get(`${PREFIX}/agent-releases/manifest`)
      .set('Authorization', `Bearer ${access()}`);
    expect(res.status).toBe(401);
  });

  it('el token de instalación sí abre agent-releases (control positivo del guard)', async () => {
    const token = jwt.sign({ sub: UUID, type: 'agent-install' }, { secret: SECRET, expiresIn: 300 });
    const res = await request(app.getHttpServer())
      .get(`${PREFIX}/agent-releases/manifest`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  /* Pipes instanciados (`new ParseEnumPipe`): los que se pasan como clase los sustituye `useMocker`. */
  it('parámetros de ruta o consulta no válidos: 400, nunca 500', async () => {
    const token = access();
    const bad: [Verb, string][] = [
      ['get', `${PREFIX}/servers/filter/status/hack`],
      ['get', `${PREFIX}/servers/filter/os/hack`],
      ['patch', `${PREFIX}/servers/${UUID}/status?status=hack`],
      ['patch', `${PREFIX}/servers/${UUID}/status`],
    ];
    const statuses: string[] = [];
    for (const [verb, path] of bad) {
      const res = await request(app.getHttpServer())[verb](path).set('Authorization', `Bearer ${token}`);
      statuses.push(`${verb} ${path} → ${res.status}`);
    }
    expect(statuses).toEqual(bad.map(([verb, path]) => `${verb} ${path} → 400`));

    const ok = await request(app.getHttpServer())
      .get(`${PREFIX}/servers/filter/os/ubuntu`)
      .set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
  });

  it('control positivo: un token de acceso válido pasa la puerta', async () => {
    const res = await request(app.getHttpServer())
      .get(`${PREFIX}/notifications/unread-count`)
      .set('Authorization', `Bearer ${access()}`);
    expect(res.status).toBe(200);
  });
});
