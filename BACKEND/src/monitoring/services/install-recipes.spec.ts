import { INSTALL_GROUPS, INSTALLABLE, SSH_CLIENT_IP, isInstallGroup, isInstallable, parseOs, sh } from './install-recipes';

describe('parseOs', () => {
  it('lee os-release, gestor de paquetes y arranque', () => {
    expect(parseOs('ID=ubuntu\nLIKE=debian\nNAME=Ubuntu 24.04 LTS\nVER=24.04\nCODE=noble\nPM=apt-get\nINIT=systemd\nARCH=x86_64\nAVX=1\n')).toEqual({
      id: 'ubuntu', like: 'debian', name: 'Ubuntu 24.04 LTS', version: '24.04', codename: 'noble', pm: 'apt-get', init: 'systemd',
      snap: false, arch: 'x86_64', avx: true,
    });
  });
  it('sin gestor ni arranque reconocidos', () => {
    expect(parseOs('ID=\nLIKE=\nNAME=\n')).toEqual({ id: '', like: '', name: 'Linux', version: '', codename: '', pm: null, init: 'unknown', snap: false, arch: '', avx: false });
  });
});

describe('receta de nginx', () => {
  const plan = (pm: string, init = 'systemd') => INSTALLABLE.nginx.plan(parseOs(`PM=${pm}\nINIT=${init}`));

  it('apt: actualiza la lista e instala sin preguntar', () => {
    expect(plan('apt-get')?.install).toEqual([
      'env DEBIAN_FRONTEND=noninteractive apt-get update -q',
      'env DEBIAN_FRONTEND=noninteractive apt-get install -y -q nginx',
    ]);
  });

  it.each([
    ['dnf', 'dnf install -y nginx'],
    ['zypper', 'zypper --non-interactive install nginx'],
    ['apk', 'apk add --no-cache nginx'],
    ['pacman', 'pacman -Sy --noconfirm --needed nginx'],
  ])('%s', (pm, cmd) => {
    expect(plan(pm)?.install).toEqual([cmd]);
  });

  it('yum: si falta el paquete, lo busca en EPEL (todo en un sh -c para que sudo lo cubra)', () => {
    const [cmd] = plan('yum')!.install;
    expect(cmd.startsWith("sh -c '")).toBe(true);
    expect(cmd).toContain('epel-release');
  });

  it('systemd habilita y arranca; OpenRC usa rc-update y rc-service', () => {
    expect(plan('apt-get')?.start).toBe('systemctl enable --now nginx');
    expect(plan('apk', 'openrc')?.start).toContain('rc-update add nginx default');
    expect(plan('apk', 'unknown')?.start).toBeNull();
  });

  it('sin gestor de paquetes no hay receta', () => {
    expect(INSTALLABLE.nginx.plan(parseOs('INIT=systemd'))).toBeNull();
  });
});

describe('desinstalación completa de nginx', () => {
  const plan = (pm: string, init = 'systemd') => INSTALLABLE.nginx.uninstall(parseOs(`PM=${pm}\nINIT=${init}`))!;

  it('apt: purga los paquetes nginx* y libnginx-mod-* y lo que quedó sin uso', () => {
    const [purge, auto] = plan('apt-get').remove;
    expect(purge).toContain('apt-get purge');
    expect(purge).toContain('libnginx-mod');
    expect(auto).toContain('autoremove --purge');
  });

  it('borra configuración, registros, caché y el usuario nginx, sin tocar los sitios de /var/www', () => {
    const { cleanup } = plan('dnf');
    for (const path of ['/etc/nginx', '/var/log/nginx', '/var/cache/nginx', '/var/lib/nginx']) expect(cleanup).toContain(path);
    expect(cleanup).toContain('userdel nginx');
    expect(cleanup).toContain('deluser nginx');
    expect(cleanup).not.toMatch(/rm -rf[^;]*\/var\/www(\s|;|')/);
  });

  it('detiene según el arranque y comprueba los restos', () => {
    expect(plan('apt-get').stop).toContain('systemctl disable --now nginx');
    expect(plan('apk', 'openrc').stop).toContain('rc-update del nginx');
    expect(plan('apt-get').residue).toContain('LEFT:');
  });
});

describe('Kubernetes', () => {
  const os = (pm: string, init = 'systemd', snap = false) => parseOs(`PM=${pm}\nINIT=${init}${snap ? '\nSNAP=1' : ''}`);

  it('cada distribución usa su instalador oficial y espera a que el nodo esté listo', () => {
    expect(INSTALLABLE.k3s.plan(os('apt-get'))!.install.join(' ')).toContain('get.k3s.io');
    expect(INSTALLABLE.k0s.plan(os('dnf'))!.install).toContain('/usr/local/bin/k0s install controller --single');
    expect(INSTALLABLE.rke2.plan(os('apt-get'))!.install.join(' ')).toContain('get.rke2.io');
    expect(INSTALLABLE.microk8s.plan(os('apt-get', 'systemd', true))!.install).toEqual([expect.stringContaining('snap install microk8s --classic')]);
    for (const k of ['k3s', 'k0s', 'rke2'] as const) expect(INSTALLABLE[k].plan(os('apt-get'))!.start).toContain(' Ready');
  });

  it('MicroK8s instala snapd si falta; RKE2 y MicroK8s piden systemd', () => {
    expect(INSTALLABLE.microk8s.plan(os('apt-get'))!.install.join(' ')).toContain('snapd');
    expect(INSTALLABLE.microk8s.supports(os('apk', 'openrc'))).toContain('systemd');
    expect(INSTALLABLE.microk8s.supports(os('pacman'))).toContain('snapd');
    expect(INSTALLABLE.rke2.supports(os('apk', 'openrc'))).toContain('systemd');
    expect(INSTALLABLE.rke2.supports(os('dnf'))).toBeNull();
  });

  it('desinstalar: script oficial, iptables y red de Kubernetes, sin tocar veth ni CNI de Podman', () => {
    const u = INSTALLABLE.k3s.uninstall(os('apt-get'))!;
    expect(u.remove[0]).toContain('k3s-uninstall.sh');
    expect(u.cleanup).toContain('KUBE-');
    expect(u.cleanup).toContain('/var/lib/rancher/k3s');
    expect(u.cleanup).not.toMatch(/cali\|veth|veth\)/);
    expect(u.cleanup).not.toMatch(/rm -rf[^;]*\/etc\/cni(\s|;|')/);
    expect(INSTALLABLE.microk8s.uninstall(os('apt-get'))!.remove[0]).toContain('snap remove --purge microk8s');
    expect(INSTALLABLE.k0s.uninstall(os('apt-get'))!.remove[0]).toContain('k0s reset');
  });
});

describe('Docker', () => {
  const os = (extra: string) => parseOs(`${extra}\nINIT=systemd`);

  it('Debian/Ubuntu: instalador oficial con respaldo a docker.io', () => {
    const cmd = INSTALLABLE.docker.plan(os('ID=ubuntu\nPM=apt-get'))!.install.join(' ');
    expect(cmd).toContain('get.docker.com');
    expect(cmd).toContain('docker.io');
  });

  it('repositorio de CentOS en Rocky (aunque ID_LIKE diga fedora) y el de Fedora solo en Fedora', () => {
    expect(INSTALLABLE.docker.plan(os('ID=rocky\nLIKE=rhel centos fedora\nPM=dnf'))!.install.join(' ')).toContain('/linux/centos/docker-ce.repo');
    expect(INSTALLABLE.docker.plan(os('ID=fedora\nPM=dnf'))!.install.join(' ')).toContain('/linux/fedora/docker-ce.repo');
  });

  it('se detecta por dockerd: el docker de podman-docker no cuenta', () => {
    expect(INSTALLABLE.docker.plan(os('PM=apt-get'))!.check).toContain('dockerd');
  });

  it('desinstalar: paquetes docker*, datos, red e iptables de Docker; runc y los datos de containerd en uso se respetan', () => {
    const u = INSTALLABLE.docker.uninstall(os('PM=apt-get'))!;
    expect(u.remove[0]).toContain('containerd\\.io');
    expect(u.remove[0]).not.toContain('runc');
    expect(u.cleanup).toContain('/var/lib/docker');
    expect(u.cleanup).toContain('docker0');
    expect(u.cleanup).toContain('if ! command -v containerd');
    expect(u.cleanup).toContain('groupdel docker');
  });
});

describe('bases de datos', () => {
  const os = (lines: string) => parseOs(`${lines}\nINIT=systemd\nARCH=x86_64\nAVX=1`);

  it('PostgreSQL: crea el clúster donde el paquete no lo hace (RHEL con respaldo a initdb, Arch)', () => {
    expect(INSTALLABLE.postgresql.plan(os('PM=dnf'))!.install.join(' ')).toContain('postgresql-setup --initdb');
    expect(INSTALLABLE.postgresql.plan(os('PM=dnf'))!.install.join(' ')).toContain('initdb -D /var/lib/pgsql/data');
    expect(INSTALLABLE.postgresql.plan(os('PM=pacman'))!.install.join(' ')).toContain('initdb -D /var/lib/postgres/data');
    expect(INSTALLABLE.postgresql.plan(parseOs('PM=apk\nINIT=openrc'))!.start).toContain('rc-service postgresql setup');
  });

  it('desinstalar: grep con -e (los patrones que empiezan por guion no son opciones) y sin quitar -libs', () => {
    const [remove] = INSTALLABLE.postgresql.uninstall(os('PM=apk'))!.remove;
    expect(remove).toContain('grep -vE -e "-libs$"');
    expect(INSTALLABLE.postgresql.uninstall(os('PM=apt-get'))!.cleanup).toContain('userdel postgres');
  });

  it('MySQL solo donde está (Ubuntu, dnf); MariaDB en todas', () => {
    expect(INSTALLABLE.mysql.supports(os('ID=ubuntu\nPM=apt-get'))).toBeNull();
    expect(INSTALLABLE.mysql.supports(os('ID=debian\nPM=apt-get'))).toContain('MariaDB');
    expect(INSTALLABLE.mysql.supports(os('ID=rocky\nPM=dnf'))).toBeNull();
    expect(INSTALLABLE.mysql.supports(os('PM=apk'))).toContain('MariaDB');
    expect(INSTALLABLE.mariadb.plan(os('PM=pacman'))!.install.join(' ')).toContain('mariadb-install-db');
    expect(INSTALL_GROUPS.mysql).toEqual(['mysql', 'mariadb']);
  });

  it('MongoDB: repositorio oficial y requisitos (versión del sistema y AVX)', () => {
    expect(INSTALLABLE.mongodb.supports(os('ID=ubuntu\nCODE=noble\nPM=apt-get'))).toBeNull();
    expect(INSTALLABLE.mongodb.supports(os('ID=ubuntu\nCODE=oracular\nPM=apt-get'))).toContain('Ubuntu');
    expect(INSTALLABLE.mongodb.supports(os('ID=rocky\nLIKE=rhel centos fedora\nVER=9.3\nPM=dnf'))).toBeNull();
    expect(INSTALLABLE.mongodb.supports(os('ID=fedora\nVER=41\nPM=dnf'))).toContain('RHEL');
    expect(INSTALLABLE.mongodb.supports(parseOs('ID=ubuntu\nCODE=noble\nPM=apt-get\nARCH=x86_64'))).toContain('AVX');
    expect(INSTALLABLE.mongodb.plan(os('ID=debian\nCODE=bookworm\nPM=apt-get'))!.install.join(' ')).toContain('repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main');
    expect(INSTALLABLE.mongodb.plan(os('ID=rocky\nLIKE=rhel\nVER=9.3\nPM=dnf'))!.install[0]).toContain('yum/redhat/9/mongodb-org/8.0/$basearch/');
  });

  it('Redis: unidad según el sistema y respaldo a Valkey en Arch', () => {
    expect(INSTALLABLE.redis.plan(os('PM=apt-get'))!.start).toBe('systemctl enable --now redis-server');
    expect(INSTALLABLE.redis.plan(os('PM=zypper'))!.start).toBe('systemctl enable --now redis@default');
    expect(INSTALLABLE.redis.plan(os('PM=pacman'))!.install[0]).toContain('valkey');
  });
});

describe('Node.js', () => {
  const os = (pm: string) => parseOs(`PM=${pm}\nINIT=systemd`);

  it('LTS de NodeSource con respaldo a la distribución; no es un servicio', () => {
    const apt = INSTALLABLE.nodejs.plan(os('apt-get'))!;
    expect(apt.install.join(' ')).toContain('deb.nodesource.com/setup_lts.x');
    expect(apt.install.join(' ')).toContain('install -y -q nodejs npm');
    expect(INSTALLABLE.nodejs.plan(os('dnf'))!.install.join(' ')).toContain('rpm.nodesource.com/setup_lts.x');
    expect(apt.start).toBeNull();
    expect(apt.noService).toBe(true);
  });

  it('desinstalar: repositorio de NodeSource, módulos globales y sus enlaces, cachés; no los proyectos', () => {
    const u = INSTALLABLE.nodejs.uninstall(os('apt-get'))!;
    expect(u.cleanup).toContain('-lname "*node_modules*" -delete');
    expect(u.cleanup).toContain('/etc/apt/keyrings/nodesource.gpg');
    expect(u.cleanup).toContain('/usr/lib/node_modules');
    expect(u.cleanup).not.toMatch(/\/home\/\*\/[^ ]*node_modules/);
  });
});

describe('Tailscale', () => {
  const os = (pm: string, init = 'systemd') => parseOs(`PM=${pm}\nINIT=${init}`);

  it('instalador oficial con respaldo a la distribución; Alpine y Arch, su paquete', () => {
    const apt = INSTALLABLE.tailscale.plan(os('apt-get'))!;
    expect(apt.install.join(' ')).toContain('https://tailscale.com/install.sh');
    expect(apt.install.join(' ')).toContain('install -y -q tailscale');
    expect(INSTALLABLE.tailscale.plan(os('apk', 'openrc'))!.install).toEqual(['apk add --no-cache tailscale']);
    expect(INSTALLABLE.tailscale.plan(os('pacman'))!.install).toEqual(['pacman -Sy --noconfirm --needed tailscale']);
  });

  it('unidad tailscaled en systemd y tailscale en OpenRC; da el enlace para vincular', () => {
    expect(INSTALLABLE.tailscale.plan(os('dnf'))!.start).toBe('systemctl enable --now tailscaled');
    expect(INSTALLABLE.tailscale.plan(os('apk', 'openrc'))!.start).toContain('rc-service tailscale start');
    const access = INSTALLABLE.tailscale.plan(os('dnf'))!.access!.command;
    expect(access).toContain('timeout 20');
    expect(access).toContain('URL:');
  });

  it('desinstalar: se desvincula, limpia reglas, repositorio, clave rpm, estado e interfaz', () => {
    const u = INSTALLABLE.tailscale.uninstall(os('dnf'))!;
    expect(u.stop).toContain('logout');
    expect(u.stop).toContain('--cleanup');
    expect(u.cleanup).toContain('/var/lib/tailscale');
    expect(u.cleanup).toContain('/etc/yum.repos.d/tailscale.repo');
    expect(u.cleanup).toContain('gpg-pubkey');
    expect(u.cleanup).toContain('ip link delete tailscale0');
    expect(u.residue).toContain('LEFT:interfaz tailscale0');
  });

  it('no se desinstala si la sesión SSH entra por tailscale0', () => {
    const guard = INSTALLABLE.tailscale.uninstall(os('apt-get'))!.guard!;
    expect(guard).toContain('SSH_CONNECTION');
    expect(guard).toContain('tailscale0');
    expect(guard).toContain('BLOCK:');
  });
});

describe('WireGuard', () => {
  const os = (pm: string, init = 'systemd') => parseOs(`PM=${pm}\nINIT=${init}`);

  it('herramientas sin recomendados en apt (nada de DKMS) y una wg0 con claves, subred y puerto libres', () => {
    const apt = INSTALLABLE.wireguard.plan(os('apt-get'))!;
    expect(apt.install).toContain('env DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends wireguard-tools');
    const config = apt.install.join(' ');
    expect(config).toContain('wg genkey');
    expect(config).toContain('umask 077');
    expect(config).toContain('ListenPort = $port');
    /* Un wg0.conf existente se respeta. */
    expect(config).toContain('[ -f /etc/wireguard/wg0.conf ] && exit 0');
  });

  it('systemd: wg-quick@wg0 tras comprobar el kernel y abrir el puerto; OpenRC: servicio propio', () => {
    const sd = INSTALLABLE.wireguard.plan(os('dnf'))!;
    expect(sd.start).toContain('systemctl enable --now wg-quick@wg0');
    expect(sd.start).toContain('type wireguard');
    expect(sd.start).toContain('ufw allow');
    expect(sd.start).toContain('firewall-cmd --permanent --add-port');
    const rc = INSTALLABLE.wireguard.plan(os('apk', 'openrc'))!;
    expect(rc.install.join(' ')).toContain('/etc/init.d/wg-quick-wg0');
    expect(rc.start).toContain('rc-service wg-quick-wg0 start');
    expect(sd.access!.command).toContain('KEY:');
  });

  it('desinstalar: cierra el puerto, baja las interfaces y borra /etc/wireguard; interfaces por sysfs (BusyBox)', () => {
    const u = INSTALLABLE.wireguard.uninstall(os('apt-get'))!;
    expect(u.stop).toContain('ufw delete allow');
    expect(u.stop).toContain('firewall-cmd --permanent --remove-port');
    expect(u.stop).toContain('wg-quick down');
    expect(u.stop).toContain('DEVTYPE=wireguard');
    expect(u.cleanup).toContain('/etc/wireguard');
    expect(u.guard).toContain('DEVTYPE=wireguard');
    expect(u.guard).toContain('BLOCK:');
    expect(INSTALLABLE.wireguard.uninstall(os('pacman'))!.remove[0]).toContain('^wireguard-tools$');
  });
});

describe('fail2ban', () => {
  const os = (pm: string, init = 'systemd') => parseOs(`PM=${pm}\nINIT=${init}`);

  it('jail de sshd con la IP del panel en la lista blanca, el puerto real de sshd y la configuración validada', () => {
    const config = INSTALLABLE.fail2ban.plan(os('apt-get'))!.install.at(-1)!;
    expect(config).toContain(`ignoreip = 127.0.0.1/8 ::1 ${SSH_CLIENT_IP}`);
    expect(config).toContain('sshd -T');
    expect(config).toContain('backend = systemd');
    expect(config).toContain('fail2ban-client -t');
    /* Sin systemd, el registro de sshd del sistema. */
    expect(INSTALLABLE.fail2ban.plan(os('apk', 'openrc'))!.install.at(-1)).toContain('/var/log/messages');
  });

  it('RHEL y familia: fail2ban-server desde EPEL, sin atarlo a firewalld', () => {
    const [cmd] = INSTALLABLE.fail2ban.plan(os('dnf'))!.install;
    expect(cmd).toContain('fail2ban-server fail2ban-systemd');
    expect(cmd).toContain('epel-release');
    expect(cmd).not.toContain('fail2ban-firewalld');
  });

  it('en marcha solo con la jail de sshd cargada', () => {
    expect(INSTALLABLE.fail2ban.plan(os('apt-get'))!.running).toContain('fail2ban-client status sshd');
  });

  it('desinstalar: reglas f2b de iptables, nftables e ipset, base de bloqueos y registros', () => {
    const u = INSTALLABLE.fail2ban.uninstall(os('apt-get'))!;
    expect(u.cleanup).toContain('grep -v -e "f2b-"');
    expect(u.cleanup).toContain('nft delete table');
    expect(u.cleanup).toContain('ipset destroy');
    expect(u.cleanup).toContain('/var/lib/fail2ban');
    expect(u.cleanup).toContain('/var/log/fail2ban.log*');
  });
});

describe('restic', () => {
  const os = (pm: string, arch = 'x86_64') => parseOs(`PM=${pm}\nINIT=systemd\nARCH=${arch}`);

  it('binario oficial comprobado con SHA256SUMS, con respaldo a la distribución; no es un servicio', () => {
    const p = INSTALLABLE.restic.plan(os('apt-get'))!;
    const all = p.install.join(' ');
    expect(all).toContain('restic_${v}_linux_amd64.bz2');
    expect(all).toContain('sha256sum -c -');
    expect(all).toContain('/usr/local/bin/restic');
    expect(all).toContain('install -y -q restic');
    expect(all).not.toContain('set -e');
    expect(p.noService).toBe(true);
    expect(INSTALLABLE.restic.plan(os('apt-get', 'aarch64'))!.install.join(' ')).toContain('linux_arm64');
  });

  it('arquitectura sin binario oficial: solo la distribución', () => {
    expect(INSTALLABLE.restic.plan(os('apk', 'mips'))!.install).toEqual([expect.stringContaining('apk add --no-cache restic')]);
  });

  it('desinstalar: binario, paquetes y cachés; nunca los repositorios de copias', () => {
    const u = INSTALLABLE.restic.uninstall(os('apt-get'))!;
    expect(u.stop).toBeNull();
    expect(u.cleanup).toContain('/usr/local/bin/restic');
    expect(u.cleanup).toContain('/home/*/.cache/restic');
    expect(u.cleanup).not.toMatch(/\/srv|\/backup|\/var\/backups/);
  });
});

describe('entradas del cliente y del servidor', () => {
  it('solo reconoce servicios y grupos propios del catálogo, no los del prototipo', () => {
    expect(isInstallable('nginx')).toBe(true);
    for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(isInstallable(name)).toBe(false);
      expect(isInstallGroup(name)).toBe(false);
    }
    expect(isInstallGroup('kubernetes')).toBe(true);
  });

  it('parseOs deja solo caracteres de identificador en lo que se interpola', () => {
    const os = parseOs("ID=ubu$(id)\nCODE=noble';reboot;'\nVER=24.04`x`\nARCH=x86_64 ;id\nPM=curl\nNAME=Ubuntu $(id)\n");
    expect(os.id).toBe('ubuid');
    expect(os.codename).toBe('noblereboot');
    expect(os.version).toBe('24.04x');
    expect(os.arch).toBe('x86_64id');
    expect(os.pm).toBeNull();
    expect(os.name).not.toMatch(/[$`;']/);
  });

  it('sh() entrecomilla el script entero', () => {
    expect(sh("echo 'a' && echo b")).toBe(`sh -c 'echo '\\''a'\\'' && echo b'`);
  });
});
