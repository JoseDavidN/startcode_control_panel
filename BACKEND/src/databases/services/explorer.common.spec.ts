import { BadRequestException } from '@nestjs/common';
import { assertIdentifier, quoteMysqlId, toMysqlParam, unquoteDefault } from './explorer.common';

describe('unquoteDefault', () => {
  it.each([
    ["'Bogotá'", 'Bogotá'],
    ["'o''brien'", "o'brien"],
    ["'abc'::text", 'abc'],
    ["'2024-01-01'::date", '2024-01-01'],
    ["'a'::character varying", 'a'],
    ["''", ''],
  ])('literal %s', (raw, value) => {
    expect(unquoteDefault(raw)).toBe(value);
  });

  it.each(['now()', "nextval('t_id_seq'::regclass)", 'current_timestamp()', 'gen_random_uuid()', '0'])('no es un literal entre comillas: %s', raw => {
    expect(unquoteDefault(raw)).toBeNull();
  });
});

describe('identificadores y parámetros', () => {
  it('quoteMysqlId duplica las comillas invertidas y no parte por puntos', () => {
    expect(quoteMysqlId('users')).toBe('`users`');
    expect(quoteMysqlId('a.b')).toBe('`a.b`');
    expect(quoteMysqlId('x` ; DROP TABLE t; -- ')).toBe('`x`` ; DROP TABLE t; -- `');
  });

  it.each(['', 'a\0b', 'x'.repeat(129), 42, null])('assertIdentifier rechaza %j', name => {
    expect(() => assertIdentifier(name)).toThrow(BadRequestException);
    if (typeof name === 'string') expect(() => quoteMysqlId(name)).toThrow(BadRequestException);
  });

  it('toMysqlParam no deja que un objeto o array se expanda a SQL', () => {
    expect(toMysqlParam({ id: 1 })).toBe('{"id":1}');
    expect(toMysqlParam([1, 2])).toBe('[1,2]');
    expect(toMysqlParam(undefined)).toBeNull();
    expect(toMysqlParam('a')).toBe('a');
    expect(toMysqlParam(3)).toBe(3);
    expect(toMysqlParam(true)).toBe(true);
  });
});
