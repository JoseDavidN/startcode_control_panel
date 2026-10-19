import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RedisCommandDto, RedisDeleteKeysDto, RedisEditDto, RedisScanDto } from './redis.dto';

const errorsOf = async <T extends object>(cls: new () => T, body: object) =>
  (await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })).map(e => e.property);

describe('DTO de Redis', () => {
  it('base entre 0 y 15', async () => {
    expect(await errorsOf(RedisScanDto, { db: 0 })).toEqual([]);
    expect(await errorsOf(RedisScanDto, { db: 16 })).toEqual(['db']);
    expect(await errorsOf(RedisScanDto, { db: 1, cursor: 'abc' })).toEqual(['cursor']);
    expect(await errorsOf(RedisScanDto, { db: 1, type: 'json' })).toEqual(['type']);
  });

  it('edición: ttl null quita la caducidad, 0 no vale y la op debe existir', async () => {
    expect(await errorsOf(RedisEditDto, { db: 0, key: 'k', op: 'expire', ttl: null })).toEqual([]);
    expect(await errorsOf(RedisEditDto, { db: 0, key: 'k', op: 'expire', ttl: 0 })).toEqual(['ttl']);
    expect(await errorsOf(RedisEditDto, { db: 0, key: 'k', op: 'flush' })).toEqual(['op']);
    expect(await errorsOf(RedisEditDto, { db: 0, key: '', op: 'set', value: 'v' })).toEqual(['key']);
    expect(await errorsOf(RedisEditDto, { db: 0, key: 'k', op: 'xdel', id: 'x' })).toEqual(['id']);
    expect(await errorsOf(RedisEditDto, { db: 0, key: 'k', op: 'xadd', fields: { a: '1' } })).toEqual([]);
  });

  it('borrado y consola', async () => {
    expect(await errorsOf(RedisDeleteKeysDto, { db: 0, keys: [] })).toEqual(['keys']);
    expect(await errorsOf(RedisDeleteKeysDto, { db: 0, keys: ['a', 'b'] })).toEqual([]);
    expect(await errorsOf(RedisCommandDto, { db: 0, command: '' })).toEqual(['command']);
    expect(await errorsOf(RedisCommandDto, { db: 0, command: 'FLUSHDB', confirm: true })).toEqual([]);
  });
});
