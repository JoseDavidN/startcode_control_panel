import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheModule } from './cache.module';
import { CachePrefix, CacheService, CacheTTL } from './cache.service';

/*
 * Contra un Redis real. Solo corre con REDIS_IT_PORT (y REDIS_IT_PASSWORD);
 * usa la base 13:
 *   docker run -d --rm -p 127.0.0.1:16399:6379 redis:7
 *   REDIS_IT_PORT=16399 pnpm exec jest cache.module.it
 */
const PORT = process.env.REDIS_IT_PORT;
const run = PORT ? describe : describe.skip;

run('CacheModule con Redis (integración)', () => {
  let cache: CacheService;
  let raw: Redis;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const env = { REDIS_HOST: '127.0.0.1', REDIS_PORT: PORT!, REDIS_PASSWORD: process.env.REDIS_IT_PASSWORD ?? '', REDIS_DB: '13', REDIS_TTL: '300' };
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => env] }), CacheModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    close = () => app.close();
    cache = moduleRef.get(CacheService);
    raw = new Redis({ host: '127.0.0.1', port: Number(PORT), password: env.REDIS_PASSWORD || undefined, db: 13 });
    await raw.flushdb();
  });

  afterAll(async () => {
    raw.disconnect();
    await close();
  });

  it('guarda en Redis con el prefijo del panel y el TTL pedido', async () => {
    await cache.set(CachePrefix.METRICS, 'srv-1', { cpu: 42 }, CacheTTL.METRICS);
    expect(await cache.get(CachePrefix.METRICS, 'srv-1')).toEqual({ cpu: 42 });
    const keys = await raw.keys('*metrics:srv-1*');
    expect(keys).toEqual(['startcode-panel::metrics:srv-1']);
    const ttl = await raw.pttl(keys[0]);
    expect(ttl).toBeGreaterThan(55_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it('getOrSet solo llama al origen la primera vez', async () => {
    const fetch = jest.fn().mockResolvedValue(['p1']);
    expect(await cache.getOrSet(CachePrefix.PROCESSES, 'srv-1', fetch, CacheTTL.QUICK_STATS, 'cpu')).toEqual(['p1']);
    expect(await cache.getOrSet(CachePrefix.PROCESSES, 'srv-1', fetch, CacheTTL.QUICK_STATS, 'cpu')).toEqual(['p1']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('invalidar y limpiar solo tocan las claves del panel', async () => {
    await raw.set('ajena', 'no tocar');
    await cache.invalidateServer('srv-1');
    expect(await cache.get(CachePrefix.METRICS, 'srv-1')).toBeNull();
    await cache.set(CachePrefix.SERVER_INFO, 'x', 1, CacheTTL.CONFIG);
    await cache.reset();
    expect(await raw.keys('startcode-panel::*')).toEqual([]);
    expect(await raw.get('ajena')).toBe('no tocar');
  });
});

run('CacheModule con Redis caído', () => {
  it('no lanza: lee como «no está» y la escritura se ignora', async () => {
    /* Puerto sin nadie escuchando. */
    const env = { REDIS_HOST: '127.0.0.1', REDIS_PORT: '1', REDIS_DB: '0', REDIS_TTL: '300' };
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => env] }), CacheModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const cache = moduleRef.get(CacheService);
    await expect(cache.set(CachePrefix.METRICS, 'srv', { a: 1 }, CacheTTL.METRICS)).resolves.toBeUndefined();
    await expect(cache.get(CachePrefix.METRICS, 'srv')).resolves.toBeNull();
    const fetch = jest.fn().mockResolvedValue(7);
    await expect(cache.getOrSet(CachePrefix.METRICS, 'srv', fetch, CacheTTL.METRICS)).resolves.toBe(7);
    await app.close();
  }, 20_000);
});
