import { unquoteDefault } from './explorer.common';

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
