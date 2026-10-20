import { PathsService, normalizePath } from './paths.service';
import type { CloudConfig } from '@/common/cloud-config';
import type { StateStore } from '@/state/state.store';

describe('PathsService.validate', () => {
  const config = { allowedRoots: ['/srv/cloud'], defaultPaths: { home: '/srv/cloud/home', backups: '/srv/cloud/backups' } } as unknown as CloudConfig;
  const service = new PathsService(config, {} as StateStore);

  it('acepta rutas dentro de las carpetas permitidas', () => {
    expect(service.validate({ home: '/srv/cloud/home', backups: '/srv/cloud/respaldos' })).toEqual({});
  });
  it('rechaza rutas fuera de las carpetas permitidas', () => {
    expect(service.validate({ home: '/etc', backups: '/srv/cloud/b' }).home).toBeDefined();
    expect(service.validate({ home: '/srv/cloudx/h', backups: '/srv/cloud/b' }).home).toBeDefined();
  });
  it('rechaza rutas relativas, con .. o la raíz', () => {
    expect(service.validate({ home: 'srv/cloud/h', backups: '/srv/cloud/b' }).home).toBeDefined();
    expect(service.validate({ home: '/srv/cloud/../etc', backups: '/srv/cloud/b' }).home).toBeDefined();
    expect(service.validate({ home: '/', backups: '/srv/cloud/b' }).home).toBeDefined();
  });
  it('rechaza Home y Backups iguales o anidadas', () => {
    expect(service.validate({ home: '/srv/cloud/x', backups: '/srv/cloud/x' }).backups).toBeDefined();
    expect(service.validate({ home: '/srv/cloud/x', backups: '/srv/cloud/x/b' }).backups).toBeDefined();
    expect(service.validate({ home: '/srv/cloud/x/h', backups: '/srv/cloud/x' }).home).toBeDefined();
  });
  it('normaliza barras dobles y la final', () => {
    expect(normalizePath(' /srv//cloud/home/ ')).toBe('/srv/cloud/home');
  });
});

describe('PathsService entre usuarios', () => {
  const config = {
    allowedRoots: ['/srv/cloud'], dataDir: '/srv/cloud/.data', mediaCacheDir: '/srv/cloud/.data/media',
  } as unknown as CloudConfig;
  const users = [
    { username: 'bob', createdAt: '', passwordHash: '', paths: { home: '/srv/cloud/home', backups: '/srv/cloud/backups' } },
    { username: 'eve', createdAt: '', passwordHash: '', paths: { home: '/srv/cloud/users/eve/home', backups: '/srv/cloud/users/eve/backups' } },
  ];
  const state = { listUsers: () => users, findUser: (u: string) => users.find(x => x.username === u.toLowerCase()) } as unknown as StateStore;
  const service = new PathsService(config, state);

  it('get nunca cae en unas rutas compartidas', () => {
    expect(service.get('eve').home).toBe('/srv/cloud/users/eve/home');
    expect(() => service.get('nadie')).toThrow();
  });
  it('la carpeta users solo admite la propia', () => {
    expect(service.validate({ home: '/srv/cloud/users/eve/otra', backups: '/srv/cloud/users/eve/b2' }, 'eve')).toEqual({});
    expect(service.validate({ home: '/srv/cloud/users/mallory/home', backups: '/srv/cloud/x' }, 'eve').home).toBeDefined();
    expect(service.validate({ home: '/srv/cloud/users', backups: '/srv/cloud/x' }, 'eve').home).toBeDefined();
    expect(service.validate({ home: '/srv/cloud', backups: '/srv/cloudb' }, 'eve').home).toBeDefined();
  });
  it('rechaza la carpeta de datos internos', () => {
    expect(service.validate({ home: '/srv/cloud/.data/x', backups: '/srv/cloud/b' }).home).toBeDefined();
  });
  it.each([
    ['la misma carpeta de otro', '/srv/cloud/home'],
    ['una carpeta dentro de la de otro', '/srv/cloud/home/sub'],
  ])('set rechaza %s sin tocar el disco', async (_label, home) => {
    await expect(service.set('eve', { home, backups: '/srv/cloud/users/eve/backups' })).rejects.toMatchObject({ status: 400 });
  });
});
