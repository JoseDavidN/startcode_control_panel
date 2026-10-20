import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateServerDto } from '@servers/dto/create-server.dto';
import { CreateDatabaseConnectionDto } from '@/databases/dto/create-database-connection.dto';
import { SSH_USERNAME, isValidHost, isValidPort } from './network';

describe('isValidHost', () => {
  it.each(['192.168.1.10', '10.0.0.1', '::1', 'fe80::1', '2001:db8::42', 'localhost', 'db', 'db-01.internal', 'my_host.lan', 'example.com.', 'xn--bcher-kva.example'])(
    'admite %s',
    host => {
      expect(isValidHost(host)).toBe(true);
    },
  );

  it.each(['', ' ', ' 10.0.0.1', '10.0.0.1 ', '999.1.1.1', '1.2.3', 'a b', 'host;id', 'user@host', 'host/path', '[::1]', 'http://x', '-host', 'host-', 'a..b', 'x\0y', `${'a'.repeat(64)}.com`, 'a.'.repeat(130), null, 22])(
    'rechaza %j',
    host => {
      expect(isValidHost(host)).toBe(false);
    },
  );
});

describe('isValidPort', () => {
  it.each([1, 22, 5432, 65535])('admite %s', port => expect(isValidPort(port)).toBe(true));
  it.each([0, -1, 65536, 22.5, NaN, Infinity, '22', null])('rechaza %j', port => expect(isValidPort(port)).toBe(false));
});

describe('SSH_USERNAME', () => {
  it.each(['root', 'deploy', 'ana.gomez', 'user@corp.local', 'CORP\\ana', 'svc_1-a'])('admite %s', u => expect(SSH_USERNAME.test(u)).toBe(true));
  it.each(['', '-oProxyCommand=x', 'a b', 'a:b', 'a\nb', 'x'.repeat(65)])('rechaza %j', u => expect(SSH_USERNAME.test(u)).toBe(false));
});

describe('DTOs de conexión', () => {
  const server = { name: 'web', host: '10.0.0.5', port: 22, username: 'root', privateKey: 'k', os: 'ubuntu' };
  const errorsOf = async (cls: new () => object, body: object) =>
    (await validate(plainToInstance(cls, body))).map(e => e.property);

  it('servidor válido', async () => {
    expect(await errorsOf(CreateServerDto, server)).toEqual([]);
  });

  it('servidor: host, puerto y usuario fuera de formato', async () => {
    expect(await errorsOf(CreateServerDto, { ...server, host: 'a b;id' })).toContain('host');
    expect(await errorsOf(CreateServerDto, { ...server, port: 70000 })).toContain('port');
    expect(await errorsOf(CreateServerDto, { ...server, port: 22.5 })).toContain('port');
    expect(await errorsOf(CreateServerDto, { ...server, username: '-oProxyCommand=sh' })).toContain('username');
  });

  it('base de datos: host y caracteres de control', async () => {
    const db = { engine: 'postgresql', name: 'x', host: 'db.local', port: 5432 };
    expect(await errorsOf(CreateDatabaseConnectionDto, db)).toEqual([]);
    expect(await errorsOf(CreateDatabaseConnectionDto, { ...db, host: 'db.local/x' })).toContain('host');
    expect(await errorsOf(CreateDatabaseConnectionDto, { ...db, port: 0 })).toContain('port');
    expect(await errorsOf(CreateDatabaseConnectionDto, { ...db, database: 'a\0b' })).toContain('database');
  });
});
