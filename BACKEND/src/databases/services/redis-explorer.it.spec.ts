import { DatabaseEngine } from '../entities/database-connection.entity';
import type { ProbeTarget } from './database-probe.service';
import { DatabaseSessionService } from './database-session.service';
import { RedisExplorerService } from './redis-explorer.service';

/*
 * Contra un Redis real. Solo corre con REDIS_IT_PORT (y REDIS_IT_PASSWORD si
 * pide contraseña); usa las bases 14 y 15 y las vacía al empezar:
 *   docker run -d --rm -p 127.0.0.1:16399:6379 redis:7
 *   REDIS_IT_PORT=16399 pnpm exec jest redis-explorer.it
 */
const PORT = Number(process.env.REDIS_IT_PORT);
const run = PORT ? describe : describe.skip;

run('RedisExplorerService (integración)', () => {
  const explorer = new RedisExplorerService();
  const sessions = new DatabaseSessionService();
  const base: ProbeTarget = {
    engine: DatabaseEngine.REDIS,
    host: '127.0.0.1',
    port: PORT,
    username: '',
    password: process.env.REDIS_IT_PASSWORD ?? null,
    database: '15',
  };
  let t: ProbeTarget;

  beforeAll(async () => {
    const { sessionId, version } = await sessions.open('u', 'c', base);
    expect(version).toMatch(/^\d+\.\d+/);
    t = sessions.get('u', 'c', sessionId);
    await explorer.command(t, 15, ['FLUSHDB']);
    await explorer.command(t, 14, ['FLUSHDB']);
  });

  afterAll(() => sessions.onModuleDestroy());

  it('crea, lee y edita cada tipo', async () => {
    await explorer.edit(t, 15, { op: 'create', key: 's', type: 'string', value: 'hola', ttl: 100 });
    await explorer.edit(t, 15, { op: 'set', key: 's', value: 'adiós ñ' });
    const s = await explorer.getKey(t, 15, 's');
    expect(s).toMatchObject({ type: 'string', value: 'adiós ñ', truncated: false });
    expect(s.ttl).toBeGreaterThan(90_000);

    await explorer.edit(t, 15, { op: 'create', key: 'h', type: 'hash', field: 'a', value: '1' });
    await explorer.edit(t, 15, { op: 'hset', key: 'h', field: 'b', value: '2' });
    await explorer.edit(t, 15, { op: 'hdel', key: 'h', field: 'a' });
    expect((await explorer.getKey(t, 15, 'h')).value).toEqual([{ field: 'b', value: '2' }]);

    await explorer.edit(t, 15, { op: 'create', key: 'l', type: 'list', value: 'x' });
    await explorer.edit(t, 15, { op: 'rpush', key: 'l', value: 'y' });
    await explorer.edit(t, 15, { op: 'lpush', key: 'l', value: 'w' });
    await explorer.edit(t, 15, { op: 'lset', key: 'l', index: 1, value: 'X' });
    await explorer.edit(t, 15, { op: 'lremIndex', key: 'l', index: 0 });
    expect((await explorer.getKey(t, 15, 'l')).value).toEqual(['X', 'y']);

    await explorer.edit(t, 15, { op: 'create', key: 'st', type: 'set', member: 'm1' });
    await explorer.edit(t, 15, { op: 'sadd', key: 'st', member: 'm2' });
    await explorer.edit(t, 15, { op: 'srem', key: 'st', member: 'm1' });
    expect((await explorer.getKey(t, 15, 'st')).value).toEqual(['m2']);

    await explorer.edit(t, 15, { op: 'create', key: 'z', type: 'zset', member: 'a', score: 2 });
    await explorer.edit(t, 15, { op: 'zadd', key: 'z', member: 'b', score: 1.5 });
    expect((await explorer.getKey(t, 15, 'z')).value).toEqual([{ member: 'b', score: '1.5' }, { member: 'a', score: '2' }]);

    await explorer.edit(t, 15, { op: 'create', key: 'x', type: 'stream', fields: { evento: 'login' } });
    await explorer.edit(t, 15, { op: 'xadd', key: 'x', fields: { evento: 'logout', user: '7' } });
    const x = await explorer.getKey(t, 15, 'x');
    expect(x.length).toBe(2);
    expect((x.value as { fields: [string, string][] }[])[0].fields).toEqual([['evento', 'logout'], ['user', '7']]);
  });

  it('caducidad, renombrar y conflictos', async () => {
    await explorer.edit(t, 15, { op: 'expire', key: 'h', ttl: 50 });
    expect((await explorer.getKey(t, 15, 'h')).ttl).toBeGreaterThan(40_000);
    await explorer.edit(t, 15, { op: 'expire', key: 'h', ttl: null });
    expect((await explorer.getKey(t, 15, 'h')).ttl).toBe(-1);
    await explorer.edit(t, 15, { op: 'rename', key: 'h', newKey: 'h2' });
    await expect(explorer.edit(t, 15, { op: 'rename', key: 'h2', newKey: 's' })).rejects.toThrow('Ya existe una clave con ese nombre');
    await expect(explorer.edit(t, 15, { op: 'create', key: 's', type: 'string', value: '' })).rejects.toThrow('Ya existe');
    await expect(explorer.getKey(t, 15, 'h')).rejects.toThrow('La clave no existe');
    await expect(explorer.edit(t, 15, { op: 'hset', key: 's', field: 'f', value: 'v' })).rejects.toThrow('La clave es de otro tipo');
  });

  it('busca por patrón y tipo, separa bases y borra', async () => {
    for (let i = 0; i < 250; i++) await explorer.command(t, 14, ['SET', `user:${i}`, String(i)]);
    await explorer.command(t, 14, ['HSET', 'cfg', 'a', '1']);
    const keys = new Set<string>();
    let cursor = '0';
    do {
      const page = await explorer.scan(t, 14, 'user:*', cursor);
      page.keys.forEach(k => keys.add(k.key));
      cursor = page.cursor;
    } while (cursor !== '0');
    expect(keys.size).toBe(250);
    const hashes = await explorer.scan(t, 14, '*', '0', 'hash');
    expect(hashes.keys.map(k => k.key)).toEqual(['cfg']);
    expect((await explorer.scan(t, 15, 'user:*', '0')).keys).toEqual([]);

    const overview = await explorer.overview(t);
    expect(overview.databases).toBe(16);
    expect(overview.keyspace.find(k => k.db === 14)?.keys).toBe(251);

    expect(await explorer.deleteKeys(t, 14, ['user:1', 'user:2', 'nope'])).toEqual({ deleted: 2 });
  });

  it('consola: respuesta tal cual, errores de Redis y comandos bloqueados', async () => {
    expect((await explorer.command(t, 15, ['HGETALL', 'h2'])).reply).toEqual(['b', '2']);
    expect((await explorer.command(t, 15, ['INCRBY', 'n', '5'])).reply).toBe(5);
    expect((await explorer.command(t, 15, ['GET', 'nope'])).reply).toBeNull();
    await expect(explorer.command(t, 15, ['GET'])).rejects.toThrow(/wrong number of arguments/);
    await expect(explorer.command(t, 15, ['NOEXISTE'])).rejects.toThrow(/unknown command/);
    await expect(explorer.command(t, 15, ['SELECT', '1'])).rejects.toThrow('no se puede usar en la consola');
    /* La sesión sigue en su base después de todo lo anterior. */
    expect((await explorer.command(t, 15, ['GET', 's'])).reply).toBe('adiós ñ');
  });
});
