import { parseRange } from './files.service';

describe('parseRange', () => {
  it('sin cabecera o con varios tramos: archivo entero', () => {
    expect(parseRange(undefined, 100)).toBeUndefined();
    expect(parseRange('bytes=0-1,5-9', 100)).toBeUndefined();
    expect(parseRange('bytes=-', 100)).toBeUndefined();
  });

  it.each([
    ['bytes=0-0', { start: 0, end: 0 }],
    ['bytes=10-', { start: 10, end: 99 }],
    ['bytes=10-500', { start: 10, end: 99 }],
    ['bytes=-20', { start: 80, end: 99 }],
    ['bytes=-500', { start: 0, end: 99 }],
  ])('%s', (header, expected) => {
    expect(parseRange(header, 100)).toEqual(expected);
  });

  it('fuera del archivo: 416', () => {
    expect(parseRange('bytes=100-', 100)).toBeNull();
    expect(parseRange('bytes=50-10', 100)).toBeNull();
    expect(parseRange('bytes=-0', 100)).toBeNull();
    expect(parseRange('bytes=0-', 0)).toBeNull();
  });
});
