import { checkCommand, tokenizeCommand } from './redis-policy';

describe('tokenizeCommand', () => {
  it('separa por espacios', () => {
    expect(tokenizeCommand('  SET  clave   valor ')).toEqual(['SET', 'clave', 'valor']);
  });

  it('respeta comillas dobles con escapes y simples literales', () => {
    expect(tokenizeCommand('SET "mi clave" "linea\\nnueva \\"x\\" \\x41"')).toEqual(['SET', 'mi clave', 'linea\nnueva "x" A']);
    expect(tokenizeCommand("SET k 'sin \\n escapes'")).toEqual(['SET', 'k', 'sin \\n escapes']);
  });

  it('admite el argumento vacío entre comillas y pegado a texto', () => {
    expect(tokenizeCommand('SET k ""')).toEqual(['SET', 'k', '']);
    expect(tokenizeCommand('GET user:"15"')).toEqual(['GET', 'user:15']);
  });

  it('falla con una comilla sin cerrar', () => {
    expect(() => tokenizeCommand('SET k "abierta')).toThrow('Falta cerrar una comilla');
  });
});

describe('checkCommand', () => {
  it('deja pasar los comandos normales en cualquier caja', () => {
    expect(checkCommand(['get', 'k']).kind).toBe('ok');
    expect(checkCommand(['HGETALL', 'k']).kind).toBe('ok');
    expect(checkCommand(['CONFIG', 'GET', 'maxmemory']).kind).toBe('ok');
    expect(checkCommand(['XREAD', 'COUNT', '10', 'STREAMS', 's', '0']).kind).toBe('ok');
  });

  it('bloquea lo que rompe la conexión compartida', () => {
    for (const cmd of [['SUBSCRIBE', 'c'], ['monitor'], ['SELECT', '2'], ['MULTI'], ['BLPOP', 'l', '0'], ['QUIT']]) {
      expect(checkCommand(cmd).kind).toBe('blocked');
    }
    expect(checkCommand(['XREAD', 'BLOCK', '0', 'STREAMS', 's', '$']).kind).toBe('blocked');
    expect(checkCommand(['CLIENT', 'REPLY', 'OFF']).kind).toBe('blocked');
  });

  it('pide confirmación para lo peligroso, también por subcomando', () => {
    expect(checkCommand(['flushdb'])).toEqual({ kind: 'dangerous', reason: 'borra todas las claves de la base' });
    expect(checkCommand(['FLUSHALL', 'ASYNC']).kind).toBe('dangerous');
    expect(checkCommand(['KEYS', '*']).kind).toBe('dangerous');
    expect(checkCommand(['config', 'set', 'maxmemory', '1gb']).kind).toBe('dangerous');
    expect(checkCommand(['CLIENT', 'KILL', 'ID', '5']).kind).toBe('dangerous');
    expect(checkCommand(['CLIENT', 'LIST']).kind).toBe('ok');
    expect(checkCommand(['CLUSTER', 'INFO']).kind).toBe('ok');
  });
});
