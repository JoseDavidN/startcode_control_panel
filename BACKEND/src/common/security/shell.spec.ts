import { execFileSync } from 'child_process';
import { BadRequestException } from '@nestjs/common';
import { assertUnitName, isValidUnitName, shellQuote } from './shell';

/** Lo que recibe el programa cuando el shell interpreta `printf %s <valor entrecomillado>`. */
const roundTrip = (value: string) =>
  execFileSync('/bin/sh', ['-c', `printf %s ${shellQuote(value)}`], { encoding: 'utf8' });

describe('shellQuote', () => {
  it.each([
    'nginx',
    "it's",
    "'; rm -rf / #",
    '$(id)',
    '`id`',
    '${HOME}',
    'a b\tc',
    'línea\nnueva',
    '"comillas" y \\barras\\',
    "''''",
    '',
    '-n',
  ])('el shell recibe el valor literal: %j', value => {
    expect(roundTrip(value)).toBe(value);
  });

  it('envuelve en comillas simples y escapa el apóstrofo', () => {
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
  });

  it('rechaza el byte nulo y lo que no es texto', () => {
    expect(() => shellQuote('a\0b')).toThrow(BadRequestException);
    expect(() => shellQuote(42 as unknown as string)).toThrow(BadRequestException);
  });
});

describe('isValidUnitName', () => {
  it.each(['nginx', 'nginx.service', 'getty@tty1.service', 'systemd-fsck@dev-disk-by\\x2duuid.service', 'php8.3-fpm', 'user@1000.service'])(
    'admite %s',
    name => {
      expect(isValidUnitName(name)).toBe(true);
    },
  );

  it.each(['', '-H', '--root=/tmp', 'nginx;reboot', 'a b', '$(id)', 'x\ny', '.hidden', 'a/b', 'x'.repeat(300), null, 42])(
    'rechaza %j',
    name => {
      expect(isValidUnitName(name)).toBe(false);
      expect(() => assertUnitName(name)).toThrow(BadRequestException);
    },
  );
});
