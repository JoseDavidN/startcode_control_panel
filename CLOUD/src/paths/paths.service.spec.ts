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
