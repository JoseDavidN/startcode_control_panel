// src/sftp/utils/remote-path.util.spec.ts
import { BadRequestException } from '@nestjs/common';
import {
  assertSegment,
  formatMode,
  normalizeAbsolute,
  resolveInside,
} from './remote-path.util';

const HOME = '/home/deploy';
const NUL = String.fromCharCode(0);

describe('normalizeAbsolute', () => {
  it.each([
    ['ruta simple', '/var/www', '/var/www'],
    ['barra final', '/var/www/', '/var/www'],
    ['barras repetidas', '/var//www///html', '/var/www/html'],
    ['punto', '/var/www/./html', '/var/www/html'],
    ['home', '~', HOME],
    ['home con subruta', '~/deploy', '/home/deploy/deploy'],
    ['raíz', '/', '/'],
  ])('%s', (_caso, input, esperado) => {
    expect(normalizeAbsolute(input, HOME)).toBe(esperado);
  });

  it.each([
    ['vacía', '   '],
    ['relativa', 'var/www'],
    ['con byte nulo', `/var/www${NUL}/etc`],
    ['con salto de línea', '/var/\nwww'],
  ])('rechaza una ruta %s', (_caso, input) => {
    expect(() => normalizeAbsolute(input, HOME)).toThrow(BadRequestException);
  });
});

describe('resolveInside', () => {
  it('conserva el árbol de una carpeta subida', () => {
    expect(resolveInside('/var/www', 'assets/img/logo.svg')).toBe(
      '/var/www/assets/img/logo.svg',
    );
  });

  it('normaliza el separador de Windows', () => {
    expect(resolveInside('/var/www', 'assets\\img\\logo.svg')).toBe(
      '/var/www/assets/img/logo.svg',
    );
  });

  it.each([
    ['escapa con ..', '../../etc/cron.d/backdoor'],
    ['escapa en medio', 'dist/../../../etc/passwd'],
    ['es absoluta', '/etc/passwd'],
    ['son solo puntos', '..'],
    ['está vacía', ''],
    ['lleva un byte nulo', `archivo${NUL}.txt`],
  ])('rechaza una ruta relativa que %s', (_caso, rel) => {
    expect(() => resolveInside('/var/www', rel)).toThrow(BadRequestException);
  });

  it('no deja pasar un directorio hermano con prefijo parecido', () => {
    /* /var/www-privado empieza por /var/www pero no está dentro. */
    expect(() => resolveInside('/var/www', '../www-privado/x')).toThrow(
      BadRequestException,
    );
  });
});

describe('assertSegment', () => {
  it('acepta un nombre normal', () => {
    expect(assertSegment('  releases ')).toBe('releases');
  });

  it.each([
    ['con barra', 'a/b'],
    ['que es un punto', '.'],
    ['que es dos puntos', '..'],
    ['vacío', ' '],
  ])('rechaza un nombre %s', (_caso, name) => {
    expect(() => assertSegment(name)).toThrow(BadRequestException);
  });
});

describe('formatMode', () => {
  it.each([
    [0o040755, 'drwxr-xr-x'],
    [0o100644, '-rw-r--r--'],
    [0o120777, 'lrwxrwxrwx'],
  ])('%s se muestra como %s', (mode, esperado) => {
    expect(formatMode(mode)).toBe(esperado);
  });
});

describe('valores que no son texto o llevan control', () => {
  it('rechaza DEL y tipos inesperados con 400, sin TypeError', () => {
    expect(() => normalizeAbsolute('/tmp/a\x7fb', HOME)).toThrow(BadRequestException);
    expect(() => normalizeAbsolute(['/etc'] as unknown as string, HOME)).toThrow(BadRequestException);
    expect(() => normalizeAbsolute({} as unknown as string, HOME)).toThrow(BadRequestException);
    expect(() => resolveInside('/srv', 42 as unknown as string)).toThrow(BadRequestException);
    expect(() => assertSegment({} as unknown as string)).toThrow(BadRequestException);
    expect(() => resolveInside('/srv', `a${NUL}b`)).toThrow(BadRequestException);
  });
});
