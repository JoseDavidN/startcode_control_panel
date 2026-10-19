import { systemTraits, titleTarget } from './target-system';

describe('systemTraits', () => {
  it.each([
    ['Ubuntu 22.04.4 LTS', 'apt', 'systemd'],
    ['Debian GNU/Linux 12 (bookworm)', 'apt', 'systemd'],
    ['Rocky Linux 9.3 (Blue Onyx)', 'dnf', 'systemd'],
    ['AlmaLinux 8.9', 'dnf', 'systemd'],
    ['CentOS Linux 7 (Core)', 'yum', 'systemd'],
    ['Red Hat Enterprise Linux 7.9', 'yum', 'systemd'],
    ['Amazon Linux 2', 'yum', 'systemd'],
    ['Amazon Linux 2023', 'dnf', 'systemd'],
    ['Fedora Linux 40', 'dnf', 'systemd'],
    ['Alpine Linux v3.20', 'apk', 'openrc'],
    ['Arch Linux', 'pacman', 'systemd'],
    ['openSUSE Leap 15.5', 'zypper', 'systemd'],
    ['FreeBSD 14.0', 'pkg', 'rc'],
  ])('%s → %s / %s', (name, packages, init) => {
    expect(systemTraits(name)).toEqual({ packages, init });
  });

  it('combina varias fuentes y no adivina lo que no reconoce', () => {
    expect(systemTraits(null, 'ubuntu', undefined)).toEqual({ packages: 'apt', init: 'systemd' });
    expect(systemTraits('Solaris 11', 'other')).toEqual({ packages: null, init: null });
  });
});

describe('titleTarget', () => {
  it('toma lo que va tras el último separador', () => {
    expect(titleTarget('Terminal · web-01')).toBe('web-01');
    expect(titleTarget('Consola Redis · caché · prod')).toBe('prod');
    expect(titleTarget('Pantalla')).toBeNull();
  });
});
