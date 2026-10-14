/**
 * Recetas para instalar servicios en el servidor remoto. Puras: a partir del
 * sistema detectado devuelven los comandos; quien los ejecuta (con la
 * escalera de sudo) es `ServiceInstallService`.
 *
 * No hay un comando universal para instalar paquetes en Linux, pero sí una
 * forma universal de elegir: se detecta el gestor de paquetes que existe
 * (apt, dnf, yum, zypper, apk, pacman) y el sistema de arranque (systemd u
 * OpenRC), en vez de depender del nombre de la distribución.
 */

export type PackageManager = 'apt-get' | 'dnf' | 'yum' | 'zypper' | 'apk' | 'pacman';
export type InitSystem = 'systemd' | 'openrc' | 'unknown';

export interface RemoteOs {
  /** ID de /etc/os-release (ubuntu, debian, rocky, alpine…). */
  id: string;
  /** ID_LIKE: familia (debian, rhel fedora…). */
  like: string;
  /** PRETTY_NAME, para mostrar. */
  name: string;
  /** VERSION_ID (24.04, 9.3, 12…). */
  version: string;
  /** VERSION_CODENAME (noble, bookworm…): algunos repositorios oficiales lo piden. */
  codename: string;
  pm: PackageManager | null;
  init: InitSystem;
  /** snapd ya está instalado (MicroK8s se instala con snap). */
  snap: boolean;
  /** uname -m: x86_64, aarch64… */
  arch: string;
  /** La CPU tiene AVX (MongoDB 5.0+ lo exige en x86). */
  avx: boolean;
}

/**
 * Lo detecta sin privilegios: /etc/os-release se puede leer siempre, y
 * `command -v` dice qué gestor de paquetes hay. Una línea `CLAVE=valor` por dato.
 */
export const DETECT_OS_COMMAND = [
  '[ -r /etc/os-release ] && . /etc/os-release',
  'echo "ID=${ID:-}"',
  'echo "LIKE=${ID_LIKE:-}"',
  'echo "NAME=${PRETTY_NAME:-$(uname -s)}"',
  'echo "VER=${VERSION_ID:-}"',
  'echo "CODE=${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"',
  'for pm in apt-get dnf yum zypper apk pacman; do if command -v $pm >/dev/null 2>&1; then echo "PM=$pm"; break; fi; done',
  'if [ -d /run/systemd/system ]; then echo INIT=systemd; elif command -v rc-service >/dev/null 2>&1; then echo INIT=openrc; fi',
  'command -v snap >/dev/null 2>&1 && echo SNAP=1',
  'echo "ARCH=$(uname -m)"',
  'grep -qw avx /proc/cpuinfo 2>/dev/null && echo AVX=1',
  'true',
].join('; ');

export function parseOs(stdout: string): RemoteOs {
  const kv = new Map(
    stdout
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')] as const),
  );
  const pm = kv.get('PM') as PackageManager | undefined;
  const init = kv.get('INIT');
  return {
    id: kv.get('ID') ?? '',
    like: kv.get('LIKE') ?? '',
    name: kv.get('NAME') || 'Linux',
    version: kv.get('VER') ?? '',
    codename: kv.get('CODE') ?? '',
    pm: pm ?? null,
    init: init === 'systemd' || init === 'openrc' ? init : 'unknown',
    snap: kv.get('SNAP') === '1',
    arch: kv.get('ARCH') ?? '',
    avx: kv.get('AVX') === '1',
  };
}

export interface InstallPlan {
  /** Si ya está instalado sale con código 0 (no necesita privilegios). */
  check: string;
  /** Comandos con privilegios, en orden. */
  install: string[];
  /** Habilita el arranque con el sistema y lo inicia. */
  start: string | null;
  /** Sale con 0 si el servicio está en marcha. */
  running: string | null;
  /** Imprime la versión instalada (stdout o stderr). */
  version: string;
  /** Últimas líneas del registro del servicio, para explicar un fallo al arrancar. */
  logs: string | null;
  /** Cuánto puede tardar `start` (un clúster de Kubernetes tarda minutos en quedar listo). */
  startTimeoutMs?: number;
  /** Qué hace `start`, para el paso (por defecto, arrancar y habilitar). */
  startDetail?: string;
  /** No se ejecuta como servicio (Node.js): no hay nada que arrancar. */
  noService?: boolean;
  /**
   * Tras comprobar que está en marcha, datos para usarlo (con privilegios).
   * Una línea por dato: `URL:<enlace>` (vincular la cuenta), `INFO:<texto>` y
   * `KEY:<valor>` (una clave pública para copiar).
   */
  access?: { label: string; command: string };
}

/**
 * En los comandos de instalación se sustituye por la IP desde la que el panel
 * entra por SSH (validada). Sudo limpia SSH_CONNECTION, así que la saca el
 * servicio sin privilegios antes de instalar.
 */
export const SSH_CLIENT_IP = '{{SSH_CLIENT_IP}}';

/* Comandos compuestos van en `sh -c` para que el prefijo de sudo los cubra enteros. */
export const sh = (script: string) => `sh -c '${script.replace(/'/g, `'"'"'`)}'`;

/* Instalar un paquete sin preguntar, según el gestor. apt necesita la lista al día. */
function packageInstall(pm: PackageManager, pkg: string): string[] {
  switch (pm) {
    case 'apt-get':
      return [
        'env DEBIAN_FRONTEND=noninteractive apt-get update -q',
        `env DEBIAN_FRONTEND=noninteractive apt-get install -y -q ${pkg}`,
      ];
    case 'dnf':
      return [`dnf install -y ${pkg}`];
    case 'yum':
      /* En CentOS 7 y otros sin el paquete en la base, viene de EPEL. */
      return [sh(`yum install -y ${pkg} || (yum install -y epel-release && yum install -y ${pkg})`)];
    case 'zypper':
      return [`zypper --non-interactive install ${pkg}`];
    case 'apk':
      return [`apk add --no-cache ${pkg}`];
    case 'pacman':
      return [`pacman -Sy --noconfirm --needed ${pkg}`];
  }
}

function serviceStart(init: InitSystem, unit: string): { start: string | null; running: string | null; logs: string | null } {
  if (init === 'systemd') {
    return {
      start: `systemctl enable --now ${unit}`,
      running: `systemctl is-active --quiet ${unit}`,
      logs: `journalctl -u ${unit} -n 20 --no-pager`,
    };
  }
  if (init === 'openrc') {
    return {
      start: sh(`rc-update add ${unit} default && rc-service ${unit} start`),
      running: `rc-service ${unit} status`,
      logs: `tail -n 20 /var/log/${unit}/error.log`,
    };
  }
  return { start: null, running: null, logs: null };
}

export interface UninstallPlan {

  /** Detiene el servicio y lo quita del arranque (sin fallar si ya estaba parado). */
  stop: string | null;
  /** Desinstala los paquetes con su configuración y lo que arrastraron. */
  remove: string[];
  /** Borra lo que los paquetes dejan atrás: config, registros, caché, usuario… */
  cleanup: string;
  /** Imprime `LEFT:<ruta>` por cada resto que quede; nada si está limpio. */
  residue: string;
  /**
   * Sin privilegios y antes de tocar nada: imprime `BLOCK:<motivo>` si
   * desinstalar dejaría al panel sin acceso (la sesión SSH entra por esa VPN).
   */
  guard?: string;
}

/*
 * Desinstalar paquetes por patrón: se listan los instalados que empiezan por
 * el nombre (módulos y paquetes auxiliares incluidos) y se quitan juntos.
 */
function packageRemove(pm: PackageManager, prefix: string): string[] {
  switch (pm) {
    case 'apt-get':
      return [
        sh(`pkgs=$(dpkg -l 2>/dev/null | awk '/^(ii|rc) +(${prefix}|lib${prefix}-mod)/{print $2}'); [ -z "$pkgs" ] || env DEBIAN_FRONTEND=noninteractive apt-get purge -y -q $pkgs`),
        'env DEBIAN_FRONTEND=noninteractive apt-get autoremove --purge -y -q',
      ];
    case 'dnf':
    case 'yum':
      return [sh(`pkgs=$(rpm -qa --qf "%{NAME}\\n" "${prefix}" "${prefix}-*"); [ -z "$pkgs" ] || ${pm} remove -y $pkgs`), `${pm} autoremove -y`];
    case 'zypper':
      return [sh(`pkgs=$(rpm -qa --qf "%{NAME}\\n" "${prefix}" "${prefix}-*"); [ -z "$pkgs" ] || zypper --non-interactive remove --clean-deps $pkgs`)];
    case 'apk':
      return [sh(`pkgs=$(apk info 2>/dev/null | grep -E "^${prefix}(-|$)"); [ -z "$pkgs" ] || apk del --purge $pkgs`)];
    case 'pacman':
      return [sh(`pkgs=$(pacman -Qq 2>/dev/null | grep -E "^${prefix}(-|$)"); [ -z "$pkgs" ] || pacman -Rns --noconfirm $pkgs`)];
  }
}

function serviceStop(init: InitSystem, unit: string): string | null {
  if (init === 'systemd') return sh(`systemctl disable --now ${unit} 2>/dev/null; true`);
  if (init === 'openrc') return sh(`rc-service ${unit} stop 2>/dev/null; rc-update del ${unit} default 2>/dev/null; true`);
  return null;
}

/*
 * Restos de nginx en cualquier distribución. Los sitios del usuario en
 * /var/www no son de nginx y no se tocan: solo la página de bienvenida que
 * pone Debian/Ubuntu y las carpetas si quedan vacías. El usuario de sistema
 * solo se borra si se llama nginx (Debian usa www-data, que comparten otros).
 */
const NGINX_PATHS = [
  '/etc/nginx', '/var/log/nginx', '/var/cache/nginx', '/var/lib/nginx', '/usr/share/nginx', '/usr/lib/nginx',
  '/run/nginx', '/run/nginx.pid', '/var/run/nginx.pid', '/etc/logrotate.d/nginx', '/etc/default/nginx',
  '/etc/sysconfig/nginx', '/etc/init.d/nginx', '/etc/conf.d/nginx', '/etc/systemd/system/nginx.service',
  '/etc/systemd/system/nginx.service.d', '/etc/systemd/system/multi-user.target.wants/nginx.service',
  '/usr/share/doc/nginx', '/var/www/html/index.nginx-debian.html',
];

function nginxUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: serviceStop(os.init, 'nginx'),
    remove: packageRemove(os.pm, 'nginx'),
    cleanup: sh([
      `rm -rf ${NGINX_PATHS.join(' ')}`,
      'rmdir /var/www/html /var/www 2>/dev/null',
      /* userdel/groupdel (shadow) o deluser/delgroup (BusyBox, Alpine). */
      'if id -u nginx >/dev/null 2>&1; then userdel nginx 2>/dev/null || deluser nginx 2>/dev/null; fi',
      'if getent group nginx >/dev/null 2>&1; then groupdel nginx 2>/dev/null || delgroup nginx 2>/dev/null; fi',
      os.init === 'systemd' ? 'systemctl daemon-reload; systemctl reset-failed nginx 2>/dev/null' : 'true',
      'true',
    ].join('; ')),
    residue: sh([
      `for p in ${NGINX_PATHS.join(' ')} /usr/sbin/nginx /usr/bin/nginx; do [ -e "$p" ] && echo "LEFT:$p"; done`,
      'id -u nginx >/dev/null 2>&1 && echo "LEFT:usuario nginx"',
      'getent group nginx >/dev/null 2>&1 && echo "LEFT:grupo nginx"',
      'true',
    ].join('; ')),
  };
}

/** Nginx: mismo paquete y misma unidad en todas las distribuciones. */
function nginx(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  return {
    /* Fuera del PATH de un usuario sin privilegios suele estar en /usr/sbin. */
    check: sh('command -v nginx >/dev/null 2>&1 || [ -x /usr/sbin/nginx ]'),
    install: packageInstall(os.pm, 'nginx'),
    ...serviceStart(os.init, 'nginx'),
    version: sh('(command -v nginx >/dev/null 2>&1 && nginx -v || /usr/sbin/nginx -v) 2>&1'),
  };
}

/* ── Kubernetes ─────────────────────────────────────────────────────
 * Distribuciones de un nodo, cada una con su instalador oficial. Todas dejan
 * el nodo como plano de control y trabajador a la vez. Desinstalar usa su
 * script oficial y luego borra lo que deje: datos, configuración, CNI,
 * reglas de iptables de Kubernetes e interfaces de red. */

/* curl hace falta para los instaladores oficiales. */
function ensureCurl(pm: PackageManager): string {
  return sh(`command -v curl >/dev/null 2>&1 || (${packageInstall(pm, 'curl').join(' && ')})`);
}

/** Espera a que el nodo esté Ready (hasta `seconds`). Sin `sh -c`, para componerlo. */
const waitNodeReadyScript = (kubectl: string, seconds = 300) =>
  `i=0; while [ $i -lt ${Math.ceil(seconds / 5)} ]; do ${kubectl} get nodes 2>/dev/null | grep -q " Ready" && exit 0; i=$((i+1)); sleep 5; done; exit 1`;
const waitNodeReady = (kubectl: string, seconds = 300) => sh(waitNodeReadyScript(kubectl, seconds));

const KUBE_START_TIMEOUT_MS = 12 * 60_000;

/* Reglas de iptables que crean Kubernetes y su red (cadenas KUBE-, CNI-, flannel, Calico). */
const FLUSH_KUBE_IPTABLES = 'for t in iptables ip6tables; do if command -v $t-save >/dev/null 2>&1; then $t-save | grep -iv -e "KUBE-" -e "CNI-" -e "flannel" -e "cali-" | $t-restore; fi; done';
/* Interfaces de red de Kubernetes que no se van solas. */
const KUBE_LINKS = 'cni0 flannel.1 flannel-v6.1 kube-bridge kube-ipvs0 vxlan.calico';
/* Las cali* son de Calico; las veth no se tocan: también son de Docker y Podman. */
const DELETE_KUBE_LINKS = `for l in ${KUBE_LINKS}; do ip link delete $l 2>/dev/null; done; for l in $(ip -o link show 2>/dev/null | awk -F": " '/: cali/{print $2}' | cut -d@ -f1); do ip link delete $l 2>/dev/null; done`;

/*
 * CNI: solo lo que pone Kubernetes. /etc/cni y /var/lib/cni también los usa
 * Podman, así que se borran los archivos de las redes de Kubernetes y las
 * carpetas solo si quedan vacías; /opt/cni, si no es de ningún paquete.
 */
const KUBE_CNI_FILES = [
  '/etc/cni/net.d/10-flannel.conflist', '/etc/cni/net.d/10-canal.conflist', '/etc/cni/net.d/10-calico.conflist',
  '/etc/cni/net.d/10-kuberouter.conflist', '/etc/cni/net.d/05-cilium.conflist', '/etc/cni/net.d/calico-kubeconfig',
  '/etc/cni/net.d/multus.d', '/var/lib/cni/networks/cbr0', '/var/lib/cni/networks/k8s-pod-network', '/var/lib/cni/flannel',
];
const CLEAN_KUBE_CNI = [
  `rm -rf ${KUBE_CNI_FILES.join(' ')}`,
  'rmdir /var/lib/cni/networks /var/lib/cni/results /var/lib/cni /etc/cni/net.d /etc/cni 2>/dev/null',
  'if [ -d /opt/cni ] && ! (dpkg -S /opt/cni >/dev/null 2>&1 || rpm -qf /opt/cni >/dev/null 2>&1); then rm -rf /opt/cni; fi',
].join('; ');
const LEFT_KUBE_LINKS = `for l in ${KUBE_LINKS}; do ip link show $l >/dev/null 2>&1 && echo "LEFT:interfaz $l"; done`;
const leftPaths = (paths: string[]) => `for p in ${paths.join(' ')}; do [ -e "$p" ] && echo "LEFT:$p"; done`;
const unitRunning = (init: InitSystem, unit: string) =>
  init === 'openrc' ? `rc-service ${unit} status` : `systemctl is-active --quiet ${unit}`;
const unitLogs = (init: InitSystem, unit: string) =>
  init === 'openrc' ? `tail -n 30 /var/log/${unit}.log` : `journalctl -u ${unit} -n 30 --no-pager`;

const K3S_PATHS = [
  '/usr/local/bin/k3s', '/usr/local/bin/k3s-uninstall.sh', '/usr/local/bin/k3s-agent-uninstall.sh', '/usr/local/bin/k3s-killall.sh',
  '/etc/rancher/k3s', '/var/lib/rancher/k3s', '/var/lib/kubelet', '/run/k3s', '/run/flannel',
  '/etc/systemd/system/k3s.service', '/etc/systemd/system/k3s.service.env', '/etc/systemd/system/k3s-agent.service',
  '/etc/init.d/k3s', '/etc/init.d/k3s-agent', '/var/log/k3s.log', '/var/log/k3s-agent.log',
];

function k3s(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  return {
    check: sh('[ -x /usr/local/bin/k3s ]'),
    install: [ensureCurl(os.pm), sh('curl -sfL https://get.k3s.io | sh -s -')],
    start: waitNodeReady('/usr/local/bin/k3s kubectl'),
    startTimeoutMs: KUBE_START_TIMEOUT_MS,
    startDetail: 'nodo listo',
    running: unitRunning(os.init, 'k3s'),
    version: sh('/usr/local/bin/k3s --version 2>&1 | head -1'),
    logs: unitLogs(os.init, 'k3s'),
  };
}

function k3sUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: null,
    remove: [sh('for s in /usr/local/bin/k3s-uninstall.sh /usr/local/bin/k3s-agent-uninstall.sh; do [ -x $s ] && $s; done; true')],
    cleanup: sh([
      FLUSH_KUBE_IPTABLES, DELETE_KUBE_LINKS,
      `rm -rf ${K3S_PATHS.join(' ')}`,
      CLEAN_KUBE_CNI,
      'rmdir /etc/rancher /var/lib/rancher 2>/dev/null',
      os.init === 'systemd' ? 'systemctl daemon-reload; systemctl reset-failed k3s 2>/dev/null' : 'true',
      'true',
    ].join('; ')),
    residue: sh([leftPaths([...K3S_PATHS, ...KUBE_CNI_FILES]), LEFT_KUBE_LINKS, 'true'].join('; ')),
  };
}

/* MicroK8s llega por snap. Si falta snapd, se instala (en RHEL y familia, de EPEL). */
function ensureSnap(os: RemoteOs): string[] {
  if (os.snap) return [];
  const pkg = os.pm === 'apt-get'
    ? packageInstall('apt-get', 'snapd')
    : [sh(`${os.pm} install -y snapd || (${os.pm} install -y epel-release && ${os.pm} install -y snapd)`)];
  return [...pkg, 'systemctl enable --now snapd.socket', sh('[ -e /snap ] || ln -s /var/lib/snapd/snap /snap'), sh('snap wait system seed.loaded')];
}

const MICROK8S_PATHS = ['/snap/microk8s', '/var/snap/microk8s', '/snap/bin/microk8s', '/root/snap/microk8s'];

function microk8s(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  return {
    check: sh('[ -e /snap/bin/microk8s ] || (command -v snap >/dev/null 2>&1 && snap list microk8s >/dev/null 2>&1)'),
    install: [...ensureSnap(os), sh('snap install microk8s --classic')],
    start: '/snap/bin/microk8s status --wait-ready --timeout 600',
    startTimeoutMs: KUBE_START_TIMEOUT_MS,
    startDetail: 'nodo listo',
    running: sh('/snap/bin/microk8s status --timeout 30 | grep -q "is running"'),
    version: sh('snap list microk8s | awk "NR==2{print \\$2\\" (\\"\\$4\\")\\"}"'),
    logs: 'journalctl -u snap.microk8s.daemon-kubelite -n 30 --no-pager',
  };
}

function microk8sUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: sh('[ -e /snap/bin/microk8s ] && /snap/bin/microk8s stop; true'),
    /* --purge: sin instantánea de los datos; se van con el snap. */
    remove: [sh('command -v snap >/dev/null 2>&1 && snap list microk8s >/dev/null 2>&1 && snap remove --purge microk8s; true')],
    cleanup: sh([
      FLUSH_KUBE_IPTABLES, DELETE_KUBE_LINKS,
      `rm -rf ${MICROK8S_PATHS.join(' ')} /home/*/snap/microk8s`,
      CLEAN_KUBE_CNI,
      'if getent group microk8s >/dev/null 2>&1; then groupdel microk8s 2>/dev/null || delgroup microk8s 2>/dev/null; fi',
      'true',
    ].join('; ')),
    residue: sh([
      leftPaths(MICROK8S_PATHS),
      'command -v snap >/dev/null 2>&1 && snap list microk8s >/dev/null 2>&1 && echo "LEFT:snap microk8s"',
      'getent group microk8s >/dev/null 2>&1 && echo "LEFT:grupo microk8s"',
      LEFT_KUBE_LINKS, 'true',
    ].join('; ')),
  };
}

const K0S_PATHS = [
  '/usr/local/bin/k0s', '/etc/k0s', '/var/lib/k0s', '/run/k0s', '/var/lib/kubelet',
  '/etc/systemd/system/k0scontroller.service', '/etc/systemd/system/k0sworker.service',
  '/etc/init.d/k0scontroller', '/etc/init.d/k0sworker', '/var/log/k0scontroller.log', '/var/log/k0sworker.log',
];

function k0s(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  return {
    check: sh('[ -x /usr/local/bin/k0s ]'),
    install: [
      ensureCurl(os.pm),
      sh('curl -sSLf https://get.k0s.sh | sh'),
      /* --single: plano de control y trabajador en el mismo nodo. */
      '/usr/local/bin/k0s install controller --single',
      '/usr/local/bin/k0s start',
    ],
    start: waitNodeReady('/usr/local/bin/k0s kubectl'),
    startTimeoutMs: KUBE_START_TIMEOUT_MS,
    startDetail: 'nodo listo',
    running: unitRunning(os.init, 'k0scontroller'),
    version: sh('/usr/local/bin/k0s version 2>&1 | head -1'),
    logs: unitLogs(os.init, 'k0scontroller'),
  };
}

function k0sUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: sh('[ -x /usr/local/bin/k0s ] && /usr/local/bin/k0s stop; true'),
    /* `k0s reset` quita servicios, datos y montajes del nodo. */
    remove: [sh('[ -x /usr/local/bin/k0s ] && /usr/local/bin/k0s reset; true')],
    cleanup: sh([
      FLUSH_KUBE_IPTABLES, DELETE_KUBE_LINKS,
      `rm -rf ${K0S_PATHS.join(' ')}`,
      CLEAN_KUBE_CNI,
      os.init === 'systemd' ? 'systemctl daemon-reload; systemctl reset-failed k0scontroller 2>/dev/null' : 'true',
      'true',
    ].join('; ')),
    residue: sh([leftPaths([...K0S_PATHS, ...KUBE_CNI_FILES]), LEFT_KUBE_LINKS, 'true'].join('; ')),
  };
}

const RKE2_PATHS = [
  '/usr/local/bin/rke2', '/usr/bin/rke2', '/usr/local/bin/rke2-uninstall.sh', '/usr/bin/rke2-uninstall.sh',
  '/usr/local/bin/rke2-killall.sh', '/usr/bin/rke2-killall.sh', '/usr/local/lib/systemd/system/rke2-server.service',
  '/usr/local/lib/systemd/system/rke2-agent.service', '/usr/lib/systemd/system/rke2-server.service', '/usr/lib/systemd/system/rke2-agent.service',
  '/usr/local/share/rke2', '/usr/share/rke2', '/etc/rancher/rke2', '/var/lib/rancher/rke2', '/var/lib/kubelet', '/run/k3s',
];

function rke2(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  return {
    check: sh('[ -x /usr/local/bin/rke2 ] || [ -x /usr/bin/rke2 ]'),
    install: [ensureCurl(os.pm), sh('curl -sfL https://get.rke2.io | sh -'), 'systemctl enable rke2-server.service'],
    /* El primer arranque descarga las imágenes del sistema: tarda varios minutos. */
    start: sh(`systemctl start rke2-server.service && ${waitNodeReadyScript('/var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml', 600)}`),
    startTimeoutMs: KUBE_START_TIMEOUT_MS,
    startDetail: 'nodo listo',
    running: 'systemctl is-active --quiet rke2-server',
    version: sh('$(command -v rke2 2>/dev/null || echo /usr/local/bin/rke2) --version 2>&1 | head -1'),
    logs: 'journalctl -u rke2-server -n 30 --no-pager',
  };
}

function rke2Uninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: sh('systemctl disable --now rke2-server rke2-agent 2>/dev/null; true'),
    remove: [sh('for s in /usr/local/bin/rke2-uninstall.sh /usr/bin/rke2-uninstall.sh; do if [ -x $s ]; then $s; break; fi; done; true')],
    cleanup: sh([
      FLUSH_KUBE_IPTABLES, DELETE_KUBE_LINKS,
      `rm -rf ${RKE2_PATHS.join(' ')}`,
      CLEAN_KUBE_CNI,
      'rmdir /etc/rancher /var/lib/rancher 2>/dev/null',
      'systemctl daemon-reload; systemctl reset-failed rke2-server 2>/dev/null',
      'true',
    ].join('; ')),
    residue: sh([leftPaths([...RKE2_PATHS, ...KUBE_CNI_FILES]), LEFT_KUBE_LINKS, 'true'].join('; ')),
  };
}

/* ── Docker ─────────────────────────────────────────────────────────
 * Docker Engine con buildx y compose. En Debian/Ubuntu va el instalador
 * oficial (get.docker.com); en RHEL, Rocky, Alma, CentOS y Fedora, el
 * repositorio oficial; en el resto (openSUSE, Alpine, Arch), el paquete de la
 * distribución. Desinstalar lo quita todo, imágenes y volúmenes incluidos. */

function dockerInstall(os: RemoteOs): string[] {
  const pm = os.pm!;
  switch (pm) {
    case 'apt-get':
      /* El instalador oficial no admite derivadas (Mint, Pop!_OS…): entonces, el paquete docker.io. */
      return [ensureCurl(pm), sh('curl -fsSL https://get.docker.com | sh || (env DEBIAN_FRONTEND=noninteractive apt-get update -q && env DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io)')];
    case 'dnf':
    case 'yum': {
      /* Rocky, Alma y CentOS también dicen «fedora» en ID_LIKE: el de Fedora, solo en Fedora (o derivadas sin rhel). */
      const fedora = os.id === 'fedora' || (/fedora/.test(os.like) && !/rhel|centos/.test(os.like));
      const repo = fedora ? 'fedora' : 'centos';
      return [
        ensureCurl(pm),
        sh(`curl -fsSL https://download.docker.com/linux/${repo}/docker-ce.repo -o /etc/yum.repos.d/docker-ce.repo`),
        `${pm} install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`,
      ];
    }
    case 'zypper':
      return ['zypper --non-interactive install docker docker-compose'];
    case 'apk':
      return ['apk add --no-cache docker docker-cli-compose'];
    case 'pacman':
      return ['pacman -Sy --noconfirm --needed docker docker-compose docker-buildx'];
  }
}

/* Paquetes de Docker según el gestor. runc no: también es de Podman; si nadie lo usa, se va con autoremove. */
function dockerRemove(pm: PackageManager): string[] {
  switch (pm) {
    case 'apt-get':
      return [
        sh(`pkgs=$(dpkg -l 2>/dev/null | awk '/^(ii|rc) +(docker|containerd\\.io)/{print $2}'); [ -z "$pkgs" ] || env DEBIAN_FRONTEND=noninteractive apt-get purge -y -q $pkgs`),
        'env DEBIAN_FRONTEND=noninteractive apt-get autoremove --purge -y -q',
      ];
    case 'dnf':
    case 'yum':
      return [sh(`pkgs=$(rpm -qa --qf "%{NAME}\\n" "docker*" "containerd.io" "moby-*"); [ -z "$pkgs" ] || ${pm} remove -y $pkgs`), `${pm} autoremove -y`];
    case 'zypper':
      return [sh('pkgs=$(rpm -qa --qf "%{NAME}\\n" "docker*"); [ -z "$pkgs" ] || zypper --non-interactive remove --clean-deps $pkgs')];
    case 'apk':
      return [sh('pkgs=$(apk info 2>/dev/null | grep -E "^docker(-|$)"); [ -z "$pkgs" ] || apk del --purge $pkgs')];
    case 'pacman':
      return [sh('pkgs=$(pacman -Qq 2>/dev/null | grep -E "^docker(-|$)"); [ -z "$pkgs" ] || pacman -Rns --noconfirm $pkgs')];
  }
}

const DOCKER_PATHS = [
  '/var/lib/docker', '/etc/docker', '/run/docker', '/run/docker.sock', '/var/run/docker.sock', '/run/docker.pid',
  '/etc/systemd/system/docker.service.d', '/etc/systemd/system/docker.socket.d', '/etc/systemd/system/docker.service',
  '/etc/default/docker', '/etc/sysconfig/docker', '/etc/init.d/docker', '/etc/conf.d/docker', '/var/log/docker.log',
  '/usr/libexec/docker', '/usr/local/lib/docker', '/root/.docker', '/etc/apt/sources.list.d/docker.list',
  '/etc/apt/keyrings/docker.asc', '/etc/apt/keyrings/docker.gpg', '/usr/share/keyrings/docker-archive-keyring.gpg',
  '/etc/yum.repos.d/docker-ce.repo', '/usr/bin/dockerd', '/usr/bin/docker',
];
/* Redes de Docker: docker0 y los puentes br-<id> de las redes definidas por el usuario. */
const DOCKER_LINKS_DELETE = `ip link delete docker0 2>/dev/null; for l in $(ip -o link show 2>/dev/null | awk -F": " '/: br-[0-9a-f]{12}/{print $2}' | cut -d@ -f1); do ip link delete $l 2>/dev/null; done`;
const DOCKER_IPTABLES_FLUSH = 'for t in iptables ip6tables; do if command -v $t-save >/dev/null 2>&1; then $t-save | grep -v -e "DOCKER" -e "docker0" -e " br-[0-9a-f]\\{12\\}" | $t-restore; fi; done';

function docker(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  return {
    /* dockerd y no docker: podman-docker trae un `docker` que no es Docker. */
    check: sh('command -v dockerd >/dev/null 2>&1 || [ -x /usr/bin/dockerd ]'),
    install: dockerInstall(os),
    ...serviceStart(os.init, 'docker'),
    version: sh('(command -v dockerd >/dev/null 2>&1 && dockerd --version || /usr/bin/dockerd --version) 2>&1 | head -1'),
  };
}

function dockerUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: os.init === 'systemd'
      ? sh('systemctl disable --now docker.socket docker.service 2>/dev/null; systemctl stop containerd 2>/dev/null; true')
      : serviceStop(os.init, 'docker'),
    remove: dockerRemove(os.pm),
    cleanup: sh([
      DOCKER_IPTABLES_FLUSH, DOCKER_LINKS_DELETE,
      `rm -rf ${DOCKER_PATHS.join(' ')} /home/*/.docker`,
      /* containerd: sus datos solo si ya no queda containerd (Kubernetes con kubeadm también lo usa). */
      'if ! command -v containerd >/dev/null 2>&1; then rm -rf /var/lib/containerd /run/containerd /etc/containerd; fi',
      'if getent group docker >/dev/null 2>&1; then groupdel docker 2>/dev/null || delgroup docker 2>/dev/null; fi',
      os.init === 'systemd' ? 'systemctl daemon-reload; systemctl reset-failed docker 2>/dev/null' : 'true',
      'true',
    ].join('; ')),
    residue: sh([
      leftPaths(DOCKER_PATHS),
      'command -v containerd >/dev/null 2>&1 || { [ -e /var/lib/containerd ] && echo "LEFT:/var/lib/containerd"; }',
      'getent group docker >/dev/null 2>&1 && echo "LEFT:grupo docker"',
      'ip link show docker0 >/dev/null 2>&1 && echo "LEFT:interfaz docker0"',
      'true',
    ].join('; ')),
  };
}

/* ── Bases de datos ─────────────────────────────────────────────────
 * PostgreSQL, MySQL/MariaDB y Redis desde los paquetes de la distribución;
 * MongoDB desde su repositorio oficial (no está en las distribuciones por su
 * licencia). Todas quedan escuchando solo en el propio servidor, como las
 * deja cada paquete. Desinstalar borra también todas sus bases de datos. */

/** Lista los paquetes instalados que cumplen `include` (y no `exclude`) y los quita con sus restos. */
function removeByPattern(pm: PackageManager, include: string, exclude?: string): string[] {
  /* -e: un patrón que empiece por guion («-libs$») se tomaría como opción de grep. */
  const filter = `grep -E -e "${include}"${exclude ? ` | grep -vE -e "${exclude}"` : ''}`;
  switch (pm) {
    case 'apt-get':
      return [
        sh(`pkgs=$(dpkg -l 2>/dev/null | awk '/^(ii|rc) /{print $2}' | sed 's/:.*//' | ${filter}); [ -z "$pkgs" ] || env DEBIAN_FRONTEND=noninteractive apt-get purge -y -q $pkgs`),
        'env DEBIAN_FRONTEND=noninteractive apt-get autoremove --purge -y -q',
      ];
    case 'dnf':
    case 'yum':
      return [sh(`pkgs=$(rpm -qa --qf "%{NAME}\\n" | ${filter}); [ -z "$pkgs" ] || ${pm} remove -y $pkgs`), `${pm} autoremove -y`];
    case 'zypper':
      return [sh(`pkgs=$(rpm -qa --qf "%{NAME}\\n" | ${filter}); [ -z "$pkgs" ] || zypper --non-interactive remove --clean-deps $pkgs`)];
    case 'apk':
      /* Los nombres virtuales pedidos (p. ej. «postgresql») están en world y no en `apk info`; sin quitarlos, apk no borra nada. */
      return [sh(`pkgs=$({ apk info 2>/dev/null; cat /etc/apk/world 2>/dev/null; } | sort -u | ${filter}); [ -z "$pkgs" ] || apk del --purge $pkgs`)];
    case 'pacman':
      return [sh(`pkgs=$(pacman -Qq 2>/dev/null | ${filter}); [ -z "$pkgs" ] || pacman -Rns --noconfirm $pkgs`)];
  }
}

/** Borra usuarios y grupos de sistema propios (shadow o BusyBox). */
const deleteAccounts = (names: string[]) => names.map(n =>
  `if id -u ${n} >/dev/null 2>&1; then userdel ${n} 2>/dev/null || deluser ${n} 2>/dev/null; fi; if getent group ${n} >/dev/null 2>&1; then groupdel ${n} 2>/dev/null || delgroup ${n} 2>/dev/null; fi`,
).join('; ');
const leftAccounts = (names: string[]) => names.map(n =>
  `id -u ${n} >/dev/null 2>&1 && echo "LEFT:usuario ${n}"; getent group ${n} >/dev/null 2>&1 && echo "LEFT:grupo ${n}"`,
).join('; ');
const daemonReload = (init: InitSystem, units: string[]) =>
  init === 'systemd' ? `systemctl daemon-reload; systemctl reset-failed ${units.join(' ')} 2>/dev/null` : 'true';

/* El primer binario que exista de la lista, para versión y detección. */
const firstOf = (paths: string[]) => `$(for b in ${paths.join(' ')}; do [ -x "$b" ] && { echo "$b"; break; }; done)`;

/* ── PostgreSQL ── */
const PG_BINARIES = ['/usr/bin/postgres', '/usr/lib/postgresql/*/bin/postgres', '/usr/libexec/postgresql*/postgres', '/usr/pgsql-*/bin/postgres'];
const PG_PATHS = [
  '/var/lib/postgresql', '/var/lib/pgsql', '/var/lib/postgres', '/etc/postgresql', '/etc/postgresql-common', '/var/log/postgresql',
  '/run/postgresql', '/var/run/postgresql', '/usr/lib/postgresql', '/usr/share/postgresql', '/usr/share/postgresql-common',
  '/etc/conf.d/postgresql', '/etc/sysconfig/pgsql', '/etc/systemd/system/postgresql.service.d', '/root/.psql_history',
];

const PG_RHEL_INITDB = '[ -s /var/lib/pgsql/data/PG_VERSION ] || postgresql-setup --initdb || postgresql-setup initdb || su - postgres -c "initdb -D /var/lib/pgsql/data --auth-local=peer --auth-host=scram-sha-256"; [ -s /var/lib/pgsql/data/PG_VERSION ]';

function postgresql(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  const pm = os.pm;
  const install = {
    'apt-get': packageInstall(pm, 'postgresql postgresql-contrib'),
    /* postgresql-setup lee la unidad de systemd; si no puede, initdb directo con los mismos valores. */
    dnf: [`dnf install -y postgresql-server postgresql-contrib`, sh(PG_RHEL_INITDB)],
    yum: [`yum install -y postgresql-server postgresql-contrib`, sh(PG_RHEL_INITDB)],
    zypper: packageInstall(pm, 'postgresql-server postgresql-contrib'),
    apk: packageInstall(pm, 'postgresql postgresql-contrib'),
    pacman: [...packageInstall(pm, 'postgresql'), sh('[ -s /var/lib/postgres/data/PG_VERSION ] || su - postgres -c "initdb -D /var/lib/postgres/data"')],
  }[pm];
  const unit = serviceStart(os.init, 'postgresql');
  return {
    check: sh(`for b in ${PG_BINARIES.join(' ')}; do [ -x "$b" ] && exit 0; done; exit 1`),
    install,
    ...unit,
    /* Alpine: el script de OpenRC crea el clúster con `setup` la primera vez. */
    start: os.init === 'openrc'
      ? sh('ls /var/lib/postgresql/*/data/PG_VERSION >/dev/null 2>&1 || rc-service postgresql setup; rc-update add postgresql default && rc-service postgresql start')
      : unit.start,
    version: sh(`p=${firstOf(PG_BINARIES)}; [ -n "$p" ] && "$p" --version | head -1`),
  };
}

function postgresqlUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: serviceStop(os.init, 'postgresql'),
    /* postgresql-libs/libpq son de muchos clientes: se van con autoremove si nadie los usa. */
    remove: removeByPattern(os.pm, os.pm === 'pacman' ? '^postgresql$' : '^postgresql', '-libs$'),
    cleanup: sh([`rm -rf ${PG_PATHS.join(' ')} /home/*/.psql_history`, deleteAccounts(['postgres']), daemonReload(os.init, ['postgresql']), 'true'].join('; ')),
    residue: sh([leftPaths(PG_PATHS), `for b in ${PG_BINARIES.join(' ')}; do [ -e "$b" ] && echo "LEFT:$b"; done`, leftAccounts(['postgres']), 'true'].join('; ')),
  };
}

/* ── MySQL y MariaDB (comparten rutas, puerto y usuario: solo una a la vez) ── */
const MYSQLD = ['/usr/sbin/mysqld', '/usr/bin/mysqld', '/usr/libexec/mysqld'];
const MARIADBD = ['/usr/sbin/mariadbd', '/usr/bin/mariadbd', ...MYSQLD];
const MYSQL_PATHS = [
  '/var/lib/mysql', '/var/lib/mysql-files', '/var/lib/mysql-keyring', '/var/lib/mysql-upgrade', '/etc/mysql', '/etc/my.cnf', '/etc/my.cnf.d',
  '/var/log/mysql', '/var/log/mysqld.log', '/var/log/mariadb', '/run/mysqld', '/var/run/mysqld', '/etc/apparmor.d/usr.sbin.mysqld',
  '/etc/systemd/system/mysql.service.d', '/etc/systemd/system/mysqld.service.d', '/etc/systemd/system/mariadb.service.d', '/root/.mysql_history',
];
const isUbuntu = (os: RemoteOs) => os.id === 'ubuntu' || /ubuntu/.test(os.like);

function mysql(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  const apt = os.pm === 'apt-get';
  const unit = serviceStart(os.init, apt ? 'mysql' : 'mysqld');
  return {
    /* mysqld de MariaDB también se llama así: se distingue por su versión. */
    check: sh(`for b in ${MYSQLD.join(' ')}; do [ -x "$b" ] && ! "$b" --version 2>/dev/null | grep -qi mariadb && exit 0; done; exit 1`),
    install: apt
      ? packageInstall('apt-get', 'mysql-server')
      : [sh(`${os.pm} install -y mysql-server || ${os.pm} install -y community-mysql-server || ${os.pm} install -y mysql8.4-server`)],
    ...unit,
    /* Si el binario no responde (capacidades de archivo bloqueadas), la versión del paquete. */
    version: sh(`b=${firstOf(MYSQLD)}; v=$([ -n "$b" ] && "$b" --version 2>/dev/null | head -1); [ -n "$v" ] && echo "$v" || rpm -q --qf "%{NAME} %{VERSION}\\n" mysql-server community-mysql-server 2>/dev/null | grep -v "not installed" | head -1`),
  };
}

function mariadb(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  const pm = os.pm;
  /* Alpine y Arch no crean el directorio de datos al instalar. */
  const initDb = (extra = '') => sh(`[ -d /var/lib/mysql/mysql ] || mariadb-install-db --user=mysql ${extra}--datadir=/var/lib/mysql`);
  const install = {
    'apt-get': packageInstall(pm, 'mariadb-server'),
    dnf: packageInstall(pm, 'mariadb-server'),
    yum: packageInstall(pm, 'mariadb-server'),
    zypper: packageInstall(pm, 'mariadb'),
    apk: [...packageInstall(pm, 'mariadb mariadb-client'), initDb()],
    pacman: [...packageInstall(pm, 'mariadb'), initDb('--basedir=/usr ')],
  }[pm];
  return {
    check: sh(`for b in ${MARIADBD.join(' ')}; do [ -x "$b" ] && "$b" --version 2>/dev/null | grep -qi mariadb && exit 0; done; exit 1`),
    install,
    ...serviceStart(os.init, 'mariadb'),
    version: sh(`b=${firstOf(MARIADBD)}; [ -n "$b" ] && "$b" --version | head -1`),
  };
}

function mysqlFamilyUninstall(os: RemoteOs, variant: 'mysql' | 'mariadb'): UninstallPlan | null {
  if (!os.pm) return null;
  const include = variant === 'mysql'
    ? (os.pm === 'apt-get' ? '^mysql' : '^(mysql|community-mysql|mysql8)')
    : (os.pm === 'pacman' ? '^mariadb$' : '^(mariadb|galera)');
  const units = variant === 'mysql' ? ['mysql', 'mysqld'] : ['mariadb', 'mysql'];
  return {
    stop: sh(units.map(u => serviceStop(os.init, u) ?? 'true').join('; ')),
    /* Las bibliotecas cliente (-libs, connector) las usan PHP y otros: se van con autoremove si nadie las usa. */
    remove: removeByPattern(os.pm, include, '(-libs|connector-c|-common-libs)'),
    cleanup: sh([`rm -rf ${MYSQL_PATHS.join(' ')} /home/*/.mysql_history`, deleteAccounts(['mysql']), daemonReload(os.init, units), 'true'].join('; ')),
    residue: sh([leftPaths(MYSQL_PATHS), `for b in ${MARIADBD.join(' ')}; do [ -e "$b" ] && echo "LEFT:$b"; done`, leftAccounts(['mysql']), 'true'].join('; ')),
  };
}

/* ── MongoDB 8.0, repositorio oficial ── */
const MONGO_APT: Record<string, { distro: 'ubuntu' | 'debian'; component: string }> = {
  focal: { distro: 'ubuntu', component: 'multiverse' },
  jammy: { distro: 'ubuntu', component: 'multiverse' },
  noble: { distro: 'ubuntu', component: 'multiverse' },
  bookworm: { distro: 'debian', component: 'main' },
};
const rhelMajor = (os: RemoteOs) => (/rhel|centos|fedora/.test(`${os.id} ${os.like}`) && os.id !== 'fedora' ? os.version.split('.')[0] : '');

const mongodbSupport = (os: RemoteOs) => {
  /* Sin AVX, mongod 5.0+ muere con «Illegal instruction» al arrancar. */
  if (os.arch === 'x86_64' && !os.avx) return 'MongoDB 5.0 o posterior necesita un procesador con AVX y el de este servidor no lo tiene.';
  if (os.pm === 'apt-get') {
    return MONGO_APT[os.codename] ? null : `MongoDB 8.0 solo publica paquetes para Ubuntu 20.04, 22.04 y 24.04 y Debian 12; ${os.name} no está entre ellos.`;
  }
  if (os.pm === 'dnf' || os.pm === 'yum') {
    return ['8', '9'].includes(rhelMajor(os)) ? null : `MongoDB 8.0 solo publica paquetes para RHEL, Rocky, Alma y CentOS 8 y 9; ${os.name} no está entre ellos.`;
  }
  return `MongoDB no está en los repositorios de ${os.name} y su repositorio oficial no lo admite.`;
};

const MONGO_PATHS = [
  '/var/lib/mongodb', '/var/lib/mongo', '/var/log/mongodb', '/etc/mongod.conf', '/run/mongodb', '/var/run/mongodb', '/tmp/mongodb-27017.sock',
  '/etc/apt/sources.list.d/mongodb-org-8.0.list', '/usr/share/keyrings/mongodb-server-8.0.gpg', '/etc/yum.repos.d/mongodb-org-8.0.repo',
  '/etc/systemd/system/mongod.service.d', '/root/.mongodb', '/root/.dbshell', '/usr/bin/mongod', '/usr/bin/mongos', '/usr/bin/mongosh',
];

function mongodb(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  /* Si el sistema no está admitido lo dice `supports` antes de instalar; el plan
     sigue sirviendo para detectar y desinstalar una instalación hecha a mano. */
  let install: string[];
  if (os.pm === 'apt-get') {
    const repo = MONGO_APT[os.codename] ?? MONGO_APT.noble;
    install = [
      ...packageInstall('apt-get', 'curl gnupg'),
      sh('curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --batch --yes --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg'),
      sh(`echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/${repo.distro} ${os.codename}/mongodb-org/8.0 ${repo.component}" > /etc/apt/sources.list.d/mongodb-org-8.0.list`),
      ...packageInstall('apt-get', 'mongodb-org'),
    ];
  } else {
    install = [
      sh(`printf '%s\\n' '[mongodb-org-8.0]' 'name=MongoDB Repository' 'baseurl=https://repo.mongodb.org/yum/redhat/${rhelMajor(os)}/mongodb-org/8.0/$basearch/' 'gpgcheck=1' 'enabled=1' 'gpgkey=https://pgp.mongodb.com/server-8.0.asc' > /etc/yum.repos.d/mongodb-org-8.0.repo`),
      `${os.pm} install -y mongodb-org`,
    ];
  }
  return {
    check: sh('[ -x /usr/bin/mongod ]'),
    install,
    ...serviceStart(os.init, 'mongod'),
    logs: os.init === 'systemd' ? 'tail -n 20 /var/log/mongodb/mongod.log' : null,
    version: sh('/usr/bin/mongod --version 2>&1 | head -1'),
  };
}

function mongodbUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: serviceStop(os.init, 'mongod'),
    remove: removeByPattern(os.pm, '^mongodb'),
    cleanup: sh([`rm -rf ${MONGO_PATHS.join(' ')} /home/*/.mongodb /home/*/.dbshell`, deleteAccounts(['mongodb', 'mongod']), daemonReload(os.init, ['mongod']), 'true'].join('; ')),
    residue: sh([leftPaths(MONGO_PATHS), leftAccounts(['mongodb', 'mongod']), 'true'].join('; ')),
  };
}

/* ── Redis (Valkey donde la distribución lo sustituyó) ── */
const REDIS_PATHS = [
  '/etc/redis', '/etc/redis.conf', '/etc/redis-sentinel.conf', '/var/lib/redis', '/var/log/redis', '/run/redis', '/var/run/redis',
  '/etc/valkey', '/var/lib/valkey', '/var/log/valkey', '/run/valkey', '/etc/systemd/system/redis.service.d',
  '/etc/systemd/system/redis-server.service.d', '/root/.rediscli_history', '/usr/bin/redis-server', '/usr/sbin/redis-server',
];

function redis(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  const pm = os.pm;
  const install = {
    'apt-get': packageInstall(pm, 'redis-server'),
    dnf: [sh('dnf install -y redis || (dnf install -y epel-release && dnf install -y redis)')],
    yum: [sh('yum install -y redis || (yum install -y epel-release && yum install -y redis)')],
    /* openSUSE trae la configuración como plantilla: se crea la instancia «default». */
    zypper: [...packageInstall(pm, 'redis'), sh('[ -f /etc/redis/default.conf ] || { cp /etc/redis/default.conf.example /etc/redis/default.conf && chown root:redis /etc/redis/default.conf && chmod 640 /etc/redis/default.conf; }')],
    apk: packageInstall(pm, 'redis'),
    pacman: [sh('pacman -Sy --noconfirm --needed redis || pacman -Sy --noconfirm --needed valkey')],
  }[pm];
  const unitName = pm === 'apt-get' ? 'redis-server' : pm === 'zypper' ? 'redis@default' : 'redis';
  const unit = serviceStart(os.init, unitName);
  return {
    check: sh('command -v redis-server >/dev/null 2>&1 || [ -x /usr/bin/redis-server ] || [ -x /usr/sbin/redis-server ]'),
    install,
    ...unit,
    /* En Arch, si quedó Valkey, su unidad se llama valkey. */
    start: pm === 'pacman' && os.init === 'systemd' ? sh('systemctl enable --now redis 2>/dev/null || systemctl enable --now valkey') : unit.start,
    running: pm === 'pacman' && os.init === 'systemd' ? sh('systemctl is-active --quiet redis || systemctl is-active --quiet valkey') : unit.running,
    version: sh('$(command -v redis-server 2>/dev/null || echo /usr/bin/redis-server) --version 2>&1 | head -1'),
  };
}

function redisUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  const units = ['redis-server', 'redis', 'redis@default', 'valkey'];
  return {
    stop: sh(units.map(u => serviceStop(os.init, u) ?? 'true').join('; ')),
    remove: removeByPattern(os.pm, os.pm === 'pacman' ? '^(redis|valkey)$' : '^(redis|valkey)'),
    cleanup: sh([`rm -rf ${REDIS_PATHS.join(' ')} /home/*/.rediscli_history`, deleteAccounts(['redis', 'valkey']), daemonReload(os.init, units), 'true'].join('; ')),
    residue: sh([leftPaths(REDIS_PATHS), leftAccounts(['redis', 'valkey']), 'true'].join('; ')),
  };
}

/* ── Node.js ── LTS de NodeSource (repositorio oficial) en apt/dnf/yum, con
 * respaldo al paquete de la distribución; en el resto, el de la distribución.
 * Es un entorno, no un servicio: no se arranca nada. */
const NODE_PATHS = [
  '/etc/apt/sources.list.d/nodesource.list', '/etc/apt/sources.list.d/nodesource.sources', '/etc/apt/keyrings/nodesource.gpg',
  '/usr/share/keyrings/nodesource.gpg', '/etc/apt/preferences.d/nodejs', '/etc/apt/preferences.d/nsolid',
  '/etc/yum.repos.d/nodesource-nodejs.repo', '/etc/yum.repos.d/nodesource-nsolid.repo',
  '/usr/lib/node_modules', '/usr/local/lib/node_modules', '/usr/include/node', '/usr/local/include/node', '/usr/share/doc/nodejs',
  '/usr/share/systemtap/tapset/node.stp', '/etc/npmrc', '/usr/etc/npmrc', '/root/.npm', '/root/.npmrc', '/root/.node-gyp',
  '/root/.cache/node-gyp', '/root/.node_repl_history', '/usr/bin/node', '/usr/bin/npm', '/usr/bin/npx', '/usr/bin/corepack',
];
const NODE_USER_FILES = '/home/*/.npm /home/*/.npmrc /home/*/.node-gyp /home/*/.cache/node-gyp /home/*/.node_repl_history';

function nodejs(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  const pm = os.pm;
  const install = {
    'apt-get': [ensureCurl(pm), sh('(curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && env DEBIAN_FRONTEND=noninteractive apt-get install -y -q nodejs) || (env DEBIAN_FRONTEND=noninteractive apt-get update -q && env DEBIAN_FRONTEND=noninteractive apt-get install -y -q nodejs npm)')],
    dnf: [ensureCurl(pm), sh('(curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash - && dnf install -y nodejs) || dnf install -y nodejs npm')],
    yum: [ensureCurl(pm), sh('(curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash - && yum install -y nodejs) || yum install -y nodejs npm')],
    zypper: [sh('zypper --non-interactive install nodejs-default npm-default || zypper --non-interactive install nodejs22 npm22 || zypper --non-interactive install nodejs20 npm20')],
    apk: packageInstall(pm, 'nodejs npm'),
    pacman: packageInstall(pm, 'nodejs npm'),
  }[pm];
  return {
    check: sh('command -v node >/dev/null 2>&1 || [ -x /usr/bin/node ]'),
    install,
    start: null,
    running: null,
    logs: null,
    noService: true,
    version: sh('echo "Node.js $(node --version 2>/dev/null) · npm $(npm --version 2>/dev/null)"'),
  };
}

function nodejsUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: null,
    /* npm de la distribución arrastra cientos de node-*: se van con autoremove. */
    remove: removeByPattern(os.pm, os.pm === 'pacman' ? '^(nodejs|nodejs-lts-.*|npm)$' : '^(nodejs|npm|libnode)'),
    cleanup: sh([
      /* Enlaces de los paquetes globales de npm (pm2, yarn…) que apuntan a node_modules. */
      'find /usr/local/bin /usr/bin -maxdepth 1 -type l -lname "*node_modules*" -delete 2>/dev/null',
      `rm -rf ${NODE_PATHS.join(' ')} ${NODE_USER_FILES}`,
      'true',
    ].join('; ')),
    residue: sh([
      leftPaths(NODE_PATHS),
      'command -v node >/dev/null 2>&1 && echo "LEFT:$(command -v node)"',
      'find /usr/local/bin /usr/bin -maxdepth 1 -type l -lname "*node_modules*" 2>/dev/null | sed "s/^/LEFT:/"',
      'true',
    ].join('; ')),
  };
}

/* ── VPN ────────────────────────────────────────────────────────────
 * Tailscale (instalador oficial) y WireGuard (herramientas de la
 * distribución y una interfaz wg0 propia). Desinstalar una VPN por la que
 * entra la propia sesión SSH dejaría el servidor inalcanzable desde el panel:
 * `guard` lo detecta con SSH_CONNECTION y lo impide. */

/** Escribe un archivo línea a línea, sin expandir nada (para componer dentro de `sh`). */
const writeFile = (path: string, lines: string[]) =>
  `printf '%s\n' ${lines.map(l => `'${l.replace(/'/g, `'"'"'`)}'`).join(' ')} > ${path}`;

/** BLOCK si la IP local de esta sesión SSH está en alguna de las interfaces que imprime `ifaces`. */
const sshThroughGuard = (ifaces: string, reason: string) => sh([
  'ipb=$(command -v ip || echo /sbin/ip)',
  'set -- $SSH_CONNECTION',
  'me=$3',
  '[ -n "$me" ] || exit 0',
  `for i in ${ifaces}; do $ipb -o addr show dev "$i" 2>/dev/null | grep -q " $me/" && echo "BLOCK:${reason}"; done`,
  'true',
].join('; '));

/* ── Tailscale ── */
const TAILSCALE_PATHS = [
  '/var/lib/tailscale', '/var/cache/tailscale', '/run/tailscale', '/var/run/tailscale', '/etc/default/tailscaled',
  '/etc/conf.d/tailscale', '/etc/conf.d/tailscaled', '/var/log/tailscaled.log', '/etc/systemd/system/tailscaled.service.d',
  '/etc/apt/sources.list.d/tailscale.list', '/usr/share/keyrings/tailscale-archive-keyring.gpg', '/etc/yum.repos.d/tailscale.repo',
  '/etc/zypp/repos.d/tailscale-stable.repo', '/usr/sbin/tailscaled', '/usr/bin/tailscaled', '/usr/bin/tailscale', '/root/.local/share/tailscale',
];
const TS = '$(command -v tailscale || echo /usr/bin/tailscale)';
const TAILSCALE_UNIT = (init: InitSystem) => (init === 'openrc' ? 'tailscale' : 'tailscaled');
/* Reglas que tailscaled añade (si quedaron tras `--cleanup`). */
const TAILSCALE_IPTABLES_FLUSH = 'for t in iptables ip6tables; do if command -v $t-save >/dev/null 2>&1; then $t-save | grep -v -e "ts-input" -e "ts-forward" -e "ts-postrouting" | $t-restore; fi; done';
/* Clave del repositorio importada en la base de rpm. */
const TAILSCALE_RPM_KEYS = 'rpm -q gpg-pubkey --qf "%{NAME}-%{VERSION}-%{RELEASE} %{SUMMARY}\\n" 2>/dev/null | grep -i tailscale | cut -d" " -f1';

function tailscale(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  const pm = os.pm;
  /* El instalador oficial añade su repositorio en apt, dnf, yum y zypper; si no admite la versión, el paquete de la distribución. */
  const official = [ensureCurl(pm), sh(`curl -fsSL https://tailscale.com/install.sh | sh || (${packageInstall(pm, 'tailscale').join(' && ')})`)];
  const install = {
    'apt-get': official,
    dnf: official,
    yum: official,
    zypper: official,
    apk: packageInstall(pm, 'tailscale'),
    pacman: packageInstall(pm, 'tailscale'),
  }[pm];
  return {
    check: sh('command -v tailscaled >/dev/null 2>&1 || [ -x /usr/sbin/tailscaled ] || [ -x /usr/bin/tailscaled ]'),
    install,
    ...serviceStart(os.init, TAILSCALE_UNIT(os.init)),
    version: sh(`echo "Tailscale $(${TS} version 2>/dev/null | head -1)"`),
    access: {
      label: 'Vincular a tu red Tailscale',
      /* Ya vinculado: su IP. Si no, `tailscale up` da el enlace de inicio de sesión y
         se corta a los 20 s: tailscaled sigue esperando a que se abra. */
      command: sh([
        `t=${TS}`,
        'st=$("$t" status --json 2>/dev/null | grep -o "\\"BackendState\\": *\\"[A-Za-z]*\\"" | head -1 | sed "s/.*\\"\\([A-Za-z]*\\)\\"$/\\1/")',
        'if [ "$st" = Running ]; then echo "INFO:Vinculado a tu red Tailscale · IP $("$t" ip -4 2>/dev/null | head -1)"; exit 0; fi',
        'url=$(timeout 20 "$t" up 2>&1 | grep -o -m1 "https://[^[:space:]]*")',
        'if [ -n "$url" ]; then echo "URL:$url"; echo "INFO:Abre el enlace e inicia sesión en Tailscale para unir este servidor a tu red."; else echo "INFO:No se obtuvo el enlace: ejecuta «tailscale up» en el servidor."; fi',
      ].join('; ')),
    },
  };
}

function tailscaleUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  const unit = TAILSCALE_UNIT(os.init);
  return {
    guard: sshThroughGuard('tailscale0', 'La sesión SSH del panel entra por Tailscale: desinstalarlo cortaría el acceso. Conecta el servidor por su IP pública o de la red local y vuelve a intentarlo.'),
    /* Primero se desvincula de la red (el nodo desaparece de la consola), luego se detiene y se limpian rutas y reglas. */
    stop: sh([
      `t=${TS}`,
      '"$t" logout 2>/dev/null',
      serviceStop(os.init, unit) ?? 'true',
      '$(command -v tailscaled || echo /usr/sbin/tailscaled) --cleanup 2>/dev/null',
      'true',
    ].join('; ')),
    remove: removeByPattern(os.pm, '^tailscale'),
    cleanup: sh([
      TAILSCALE_IPTABLES_FLUSH,
      'ip link delete tailscale0 2>/dev/null',
      'command -v zypper >/dev/null 2>&1 && zypper --non-interactive removerepo tailscale-stable 2>/dev/null',
      `for k in $(${TAILSCALE_RPM_KEYS}); do rpm -e "$k" 2>/dev/null; done`,
      `rm -rf ${TAILSCALE_PATHS.join(' ')} /home/*/.local/share/tailscale`,
      daemonReload(os.init, ['tailscaled']),
      'true',
    ].join('; ')),
    residue: sh([
      leftPaths(TAILSCALE_PATHS),
      'ip link show tailscale0 >/dev/null 2>&1 && echo "LEFT:interfaz tailscale0"',
      `${TAILSCALE_RPM_KEYS} | sed "s/^/LEFT:clave rpm /"`,
      'true',
    ].join('; ')),
  };
}

/* ── WireGuard ── herramientas de la distribución y una interfaz wg0 con sus
 * claves, en la primera subred 10.x.0.0/24 libre y el primer puerto UDP libre
 * desde 51820 (abierto en ufw o firewalld si están activos). Los pares se
 * añaden después. Si ya hay un wg0.conf, se respeta. */
const WG_PATHS = [
  '/etc/wireguard', '/etc/init.d/wg-quick-wg0', '/usr/bin/wg', '/usr/bin/wg-quick', '/usr/share/doc/wireguard-tools',
];
const WG_CONF = '/etc/wireguard/wg0.conf';
const WG_PORT = `$(sed -n "s/^ListenPort *= *//p" ${WG_CONF} 2>/dev/null)`;
const WG_FW_COMMENT = 'StartCode WireGuard';
/* Interfaces WireGuard por sysfs: el `ip` de BusyBox no filtra por tipo. */
const WG_IFACES = 'for n in $(ls /sys/class/net 2>/dev/null); do grep -qs "DEVTYPE=wireguard" "/sys/class/net/$n/uevent" && echo "$n"; done'

const wgConfig = sh([
  'umask 077',
  'mkdir -p /etc/wireguard',
  `[ -f ${WG_CONF} ] && exit 0`,
  'net=""; for n in 8 9 10 11 12 13 14 15 16 17 18 19 20; do ip -o addr 2>/dev/null | grep -q " 10\\.$n\\.0\\." || { net=$n; break; }; done',
  '[ -n "$net" ] || { echo "No hay una subred 10.x.0.0/24 libre para wg0" >&2; exit 1; }',
  'port=51820; while { ss -lun 2>/dev/null || netstat -lun 2>/dev/null; } | grep -q ":$port "; do port=$((port+1)); done',
  'key=$(wg genkey) || exit 1',
  `printf "%s\\n" "# Creado por StartCode Panel" "[Interface]" "Address = 10.$net.0.1/24" "ListenPort = $port" "PrivateKey = $key" > ${WG_CONF}`,
  'echo "$key" | wg pubkey > /etc/wireguard/wg0.pub',
].join('; '));

/* OpenRC no trae un servicio para wg-quick: uno propio para wg0. */
const WG_OPENRC = writeFile('/etc/init.d/wg-quick-wg0', [
  '#!/sbin/openrc-run',
  'description="WireGuard wg0 (StartCode Panel)"',
  'depend() { need net; }',
  'start() { ebegin "Levantando wg0"; wg-quick up wg0; eend $?; }',
  'stop() { ebegin "Bajando wg0"; wg-quick down wg0; eend $?; }',
]);

function wireguard(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  const pm = os.pm;
  const tools = {
    /* Sin recomendados: arrastrarían DKMS y las cabeceras del kernel, que no hacen falta desde Linux 5.6. */
    'apt-get': ['env DEBIAN_FRONTEND=noninteractive apt-get update -q', 'env DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends wireguard-tools'],
    dnf: packageInstall(pm, 'wireguard-tools'),
    yum: packageInstall(pm, 'wireguard-tools'),
    zypper: packageInstall(pm, 'wireguard-tools'),
    apk: packageInstall(pm, 'wireguard-tools'),
    pacman: packageInstall(pm, 'wireguard-tools'),
  }[pm];
  const install = [...tools, wgConfig, ...(os.init === 'openrc' ? [sh(`${WG_OPENRC} && chmod 755 /etc/init.d/wg-quick-wg0`)] : [])];
  /* Antes de levantar: que el kernel tenga WireGuard, y el puerto abierto en el cortafuegos. */
  const prepare = [
    'modprobe wireguard 2>/dev/null',
    'ip link add sc-wgtest type wireguard 2>/dev/null && ip link delete sc-wgtest || { echo "El kernel de este servidor no tiene WireGuard (hace falta Linux 5.6 o el módulo wireguard)." >&2; exit 1; }',
    `port=${WG_PORT}`,
    `if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then ufw allow "$port/udp" comment "${WG_FW_COMMENT}" >/dev/null; fi`,
    'if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then firewall-cmd --permanent --add-port="$port/udp" >/dev/null && firewall-cmd --reload >/dev/null; fi',
  ].join('; ');
  const start = os.init === 'systemd'
    ? { start: sh(`${prepare}; systemctl enable --now wg-quick@wg0`), running: 'systemctl is-active --quiet wg-quick@wg0', logs: 'journalctl -u wg-quick@wg0 -n 20 --no-pager' }
    : os.init === 'openrc'
      ? { start: sh(`${prepare}; rc-update add wg-quick-wg0 default && rc-service wg-quick-wg0 start`), running: sh('ip link show wg0 >/dev/null 2>&1'), logs: null }
      : { start: null, running: null, logs: null };
  return {
    check: sh('command -v wg >/dev/null 2>&1 || [ -x /usr/bin/wg ]'),
    install,
    ...start,
    startDetail: 'interfaz wg0 levantada, arranca con el sistema',
    version: sh('$(command -v wg || echo /usr/bin/wg) --version 2>&1 | head -1 | cut -d" " -f1-2'),
    access: {
      label: 'Datos de la interfaz wg0',
      command: sh([
        `addr=$(sed -n "s/^Address *= *//p" ${WG_CONF} 2>/dev/null)`,
        `port=${WG_PORT}`,
        'echo "INFO:Interfaz wg0 · $addr · puerto UDP $port"',
        'pub=$(cat /etc/wireguard/wg0.pub 2>/dev/null || sed -n "s/^PrivateKey *= *//p" ' + WG_CONF + ' | wg pubkey)',
        '[ -n "$pub" ] && echo "KEY:$pub"',
        'echo "INFO:Añade los pares (clientes) con su clave pública en /etc/wireguard/wg0.conf o con «wg set wg0 peer …»."',
      ].join('; ')),
    },
  };
}

function wireguardUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    guard: sshThroughGuard(
      `$(${WG_IFACES})`,
      'La sesión SSH del panel entra por WireGuard: desinstalarlo cortaría el acceso. Conecta el servidor por su IP pública o de la red local y vuelve a intentarlo.',
    ),
    /* Se cierra el puerto (antes de borrar la configuración que lo dice) y se bajan todas las interfaces. */
    stop: sh([
      `port=${WG_PORT}`,
      `if [ -n "$port" ] && command -v ufw >/dev/null 2>&1; then ufw delete allow "$port/udp" >/dev/null 2>&1; fi`,
      'if [ -n "$port" ] && command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then firewall-cmd --permanent --remove-port="$port/udp" >/dev/null 2>&1; firewall-cmd --reload >/dev/null 2>&1; fi',
      os.init === 'systemd'
        ? 'for u in $(systemctl list-units --all --plain --no-legend "wg-quick@*" 2>/dev/null | awk "{print \\$1}"); do systemctl disable --now "$u" 2>/dev/null; done; for u in $(ls /etc/systemd/system/multi-user.target.wants 2>/dev/null | grep "^wg-quick@"); do systemctl disable "$u" 2>/dev/null; done'
        : os.init === 'openrc' ? 'rc-service wg-quick-wg0 stop 2>/dev/null; rc-update del wg-quick-wg0 default 2>/dev/null' : 'true',
      `for i in $(${WG_IFACES}); do wg-quick down "$i" 2>/dev/null || ip link delete "$i" 2>/dev/null; done`,
      'true',
    ].join('; ')),
    remove: removeByPattern(os.pm, os.pm === 'pacman' ? '^wireguard-tools$' : '^wireguard'),
    cleanup: sh([
      `rm -rf ${WG_PATHS.join(' ')} /etc/systemd/system/wg-quick@*.service.d`,
      daemonReload(os.init, ['wg-quick@wg0']),
      'true',
    ].join('; ')),
    residue: sh([
      leftPaths(WG_PATHS),
      `for i in $(${WG_IFACES}); do echo "LEFT:interfaz $i"; done`,
      `command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "${WG_FW_COMMENT}" && echo "LEFT:regla de ufw ${WG_FW_COMMENT}"`,
      'true',
    ].join('; ')),
  };
}

/* ── Seguridad y copias ─────────────────────────────────────────── */

/* ── fail2ban ── jail de sshd con el puerto real de sshd y la IP del panel en
 * la lista blanca, para que nunca se bloquee a sí mismo. Bloquea con
 * firewalld si está activo, si no con nftables o iptables. Al detenerse quita
 * sus reglas; desinstalar borra también la base de bloqueos. */
const F2B_JAIL = '/etc/fail2ban/jail.d/startcode.local';
const F2B_PATHS = [
  '/etc/fail2ban', '/var/lib/fail2ban', '/run/fail2ban', '/var/run/fail2ban', '/etc/logrotate.d/fail2ban',
  '/etc/systemd/system/fail2ban.service.d', '/usr/share/doc/fail2ban', '/usr/bin/fail2ban-server', '/usr/bin/fail2ban-client',
];
const F2B_LOGS = '/var/log/fail2ban.log*';
const F2B_IPTABLES_FLUSH = 'for t in iptables ip6tables; do if command -v $t-save >/dev/null 2>&1; then $t-save | grep -v -e "f2b-" | $t-restore; fi; done';
const F2B_NFT = 'nft list tables 2>/dev/null | grep f2b';
const F2B_IPSETS = 'ipset list -n 2>/dev/null | grep "^f2b-"';

function fail2banConfig(os: RemoteOs): string {
  return sh([
    'mkdir -p /etc/fail2ban/jail.d',
    'if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then ba=firewallcmd-multiport; elif command -v nft >/dev/null 2>&1; then ba=nftables-multiport; else ba=iptables-multiport; fi',
    /* El puerto que escucha sshd de verdad (puede no ser el 22). */
    'port=$(sshd -T 2>/dev/null | awk "/^port /{print \\$2}" | paste -s -d, -); [ -n "$port" ] || port=ssh',
    os.init === 'systemd'
      ? 'src="backend = systemd"'
      : 'log=""; for f in /var/log/auth.log /var/log/secure /var/log/messages; do [ -f "$f" ] && { log=$f; break; }; done; [ -n "$log" ] || { echo "No se encontró el registro de sshd (auth.log, secure o messages): activa el registro del sistema" >&2; exit 1; }; src="logpath = $log"',
    `printf "%s\\n" "# Creado por StartCode Panel" "[DEFAULT]" "ignoreip = 127.0.0.1/8 ::1 ${SSH_CLIENT_IP}" "bantime = 1h" "findtime = 10m" "maxretry = 5" "banaction = $ba" "" "[sshd]" "enabled = true" "port = $port" "$src" > ${F2B_JAIL}`,
    /* Que la configuración sea válida antes de arrancar. */
    'fail2ban-client -t >/dev/null',
  ].join('; '));
}

function fail2ban(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  const pm = os.pm;
  /* RHEL y familia: desde EPEL, sin el paquete que lo ata a firewalld (el bloqueo lo elige la configuración). */
  const rpm = (m: 'dnf' | 'yum') => sh(`${m} install -y fail2ban-server fail2ban-systemd || (${m} install -y epel-release && ${m} install -y fail2ban-server fail2ban-systemd)`);
  const install = {
    'apt-get': packageInstall(pm, 'fail2ban'),
    dnf: [rpm('dnf')],
    yum: [rpm('yum')],
    zypper: packageInstall(pm, 'fail2ban'),
    apk: packageInstall(pm, 'fail2ban'),
    pacman: packageInstall(pm, 'fail2ban'),
  }[pm];
  const unit = serviceStart(os.init, 'fail2ban');
  return {
    check: sh('command -v fail2ban-server >/dev/null 2>&1 || [ -x /usr/bin/fail2ban-server ]'),
    install: [...install, fail2banConfig(os)],
    ...unit,
    /* Arrancado y con la jail de sshd cargada (tarda un par de segundos). */
    running: unit.running && sh(`${unit.running} || exit 1; i=0; while [ $i -lt 15 ]; do fail2ban-client status sshd >/dev/null 2>&1 && exit 0; i=$((i+1)); sleep 1; done; exit 1`),
    logs: os.init === 'systemd' ? 'journalctl -u fail2ban -n 20 --no-pager' : `tail -n 20 /var/log/fail2ban.log`,
    startDetail: 'protege SSH y arranca con el sistema',
    version: sh('fail2ban-client --version 2>&1 | head -1'),
    access: {
      label: 'Protección de SSH',
      command: sh([
        'n=$(fail2ban-client status sshd 2>/dev/null | sed -n "s/.*Currently banned:[[:space:]]*//p")',
        'echo "INFO:Jail sshd activa: bloquea 1 h una IP con 5 accesos fallidos en 10 min · IPs bloqueadas ahora: ${n:-0}"',
        `ip=$(sed -n "s/^ignoreip = 127.0.0.1\\/8 ::1 *//p" ${F2B_JAIL} 2>/dev/null)`,
        '[ -n "$ip" ] && echo "INFO:Nunca bloquea la IP del panel ($ip) ni el propio servidor"',
        'echo "INFO:Para desbloquear una IP: fail2ban-client set sshd unbanip <IP>"',
      ].join('; ')),
    },
  };
}

function fail2banUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    /* Al detenerse, fail2ban quita sus bloqueos y reglas. */
    stop: serviceStop(os.init, 'fail2ban'),
    remove: removeByPattern(os.pm, os.pm === 'pacman' ? '^fail2ban$' : '^fail2ban'),
    cleanup: sh([
      F2B_IPTABLES_FLUSH,
      `${F2B_NFT} | while read -r _ fam name; do nft delete table "$fam" "$name" 2>/dev/null; done`,
      `for s in $(${F2B_IPSETS}); do ipset destroy "$s" 2>/dev/null; done`,
      `rm -rf ${F2B_PATHS.join(' ')} ${F2B_LOGS}`,
      daemonReload(os.init, ['fail2ban']),
      'true',
    ].join('; ')),
    residue: sh([
      leftPaths(F2B_PATHS),
      `for f in ${F2B_LOGS}; do [ -e "$f" ] && echo "LEFT:$f"; done`,
      'for t in iptables ip6tables; do command -v $t-save >/dev/null 2>&1 && $t-save 2>/dev/null | grep -q "f2b-" && echo "LEFT:reglas f2b de $t"; done',
      `${F2B_NFT} | sed "s/^/LEFT:nftables /"`,
      `${F2B_IPSETS} | sed "s/^/LEFT:ipset /"`,
      'true',
    ].join('; ')),
  };
}

/* ── restic ── binario oficial de la última versión (GitHub, comprobado con
 * su SHA256SUMS) en /usr/local/bin; si no se puede, el de la distribución.
 * Es una herramienta, no un servicio. Desinstalar no toca los repositorios de
 * copias: son datos del usuario y pueden estar en cualquier sitio. */
const RESTIC_PATHS = [
  '/usr/local/bin/restic', '/usr/bin/restic', '/root/.cache/restic', '/etc/bash_completion.d/restic',
  '/usr/share/bash-completion/completions/restic', '/usr/share/zsh/site-functions/_restic', '/usr/share/doc/restic',
];
const RESTIC_USER_FILES = '/home/*/.cache/restic';
const RESTIC_ARCH: Record<string, string> = { x86_64: 'amd64', aarch64: 'arm64', armv7l: 'arm', armv6l: 'arm', i686: '386', i386: '386', ppc64le: 'ppc64le', s390x: 's390x', riscv64: 'riscv64' };

function restic(os: RemoteOs): InstallPlan | null {
  if (!os.pm) return null;
  const pm = os.pm;
  const arch = RESTIC_ARCH[os.arch];
  const distro = pm === 'dnf' || pm === 'yum'
    ? `${pm} install -y restic || (${pm} install -y epel-release && ${pm} install -y restic)`
    : packageInstall(pm, 'restic').join(' && ');
  /* Con `&&` y no `set -e`: dentro de `( … ) || ( … )` la shell ignora `set -e`. */
  const official = arch && [
    'tmp=$(mktemp -d)',
    'trap "rm -rf $tmp" EXIT',
    /* La última versión sale de la redirección de /releases/latest (sin la API, que limita las peticiones). */
    'v=$(curl -fsSLI -o /dev/null -w "%{url_effective}" https://github.com/restic/restic/releases/latest | sed "s#.*/tag/v##")',
    'case "$v" in [0-9]*) true;; *) false;; esac',
    'base=https://github.com/restic/restic/releases/download/v$v',
    `curl -fsSL -o "$tmp/restic_\${v}_linux_${arch}.bz2" "$base/restic_\${v}_linux_${arch}.bz2"`,
    'curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS"',
    `(cd "$tmp" && grep " restic_\${v}_linux_${arch}.bz2\\$" SHA256SUMS | sha256sum -c -)`,
    `bunzip2 -c "$tmp/restic_\${v}_linux_${arch}.bz2" > "$tmp/restic"`,
    'install -m 755 "$tmp/restic" /usr/local/bin/restic',
  ].join(' && ');
  /* bzip2 hace falta para descomprimir el binario oficial. */
  const bzip = sh(`command -v bunzip2 >/dev/null 2>&1 || (${packageInstall(pm, 'bzip2').join(' && ')})`);
  return {
    check: sh('command -v restic >/dev/null 2>&1 || [ -x /usr/local/bin/restic ] || [ -x /usr/bin/restic ]'),
    install: official
      ? [ensureCurl(pm), bzip, sh(`(${official}) || (${distro})`)]
      : [sh(distro)],
    start: null,
    running: null,
    logs: null,
    noService: true,
    version: sh('$(command -v restic || echo /usr/local/bin/restic) version 2>&1 | head -1 | cut -d" " -f1-2'),
    access: {
      label: 'Primeros pasos',
      command: sh([
        'echo "INFO:Crea un repositorio de copias con «restic init --repo <ruta, sftp:, s3:, b2:…>» y haz copias con «restic backup»."',
        'echo "INFO:La contraseña del repositorio es la única forma de leer las copias: guárdala fuera del servidor."',
      ].join('; ')),
    },
  };
}

function resticUninstall(os: RemoteOs): UninstallPlan | null {
  if (!os.pm) return null;
  return {
    stop: null,
    remove: removeByPattern(os.pm, os.pm === 'pacman' ? '^restic$' : '^restic'),
    cleanup: sh([`rm -rf ${RESTIC_PATHS.join(' ')} ${RESTIC_USER_FILES}`, 'true'].join('; ')),
    residue: sh([leftPaths(RESTIC_PATHS), 'command -v restic >/dev/null 2>&1 && echo "LEFT:$(command -v restic)"', 'true'].join('; ')),
  };
}

const mysqlSupport = (os: RemoteOs) => {
  if (os.pm === 'apt-get') return isUbuntu(os) ? null : `${os.name} no trae MySQL en sus repositorios: instala MariaDB, compatible con MySQL.`;
  if (os.pm === 'dnf') return null;
  return `${os.name} no trae MySQL en sus repositorios: instala MariaDB, compatible con MySQL.`;
};

/* Requisitos que no se pueden cubrir instalando algo: se explican antes de empezar. */
const needsSystemd = (name: string) => (os: RemoteOs) =>
  os.init === 'systemd' ? null : `${name} necesita systemd y ${os.name} no lo usa.`;
const microk8sSupport = (os: RemoteOs) => {
  if (os.init !== 'systemd') return `MicroK8s necesita systemd y ${os.name} no lo usa.`;
  if (os.snap) return null;
  return os.pm === 'apt-get' || os.pm === 'dnf' || os.pm === 'yum'
    ? null
    : `MicroK8s se instala con snap y en ${os.name} hay que instalar snapd a mano primero.`;
};

export interface Recipe {
  label: string;
  /** Familia que comparte botón en el catálogo (Kubernetes, MySQL/MariaDB): solo puede haber una instalada. */
  group?: 'kubernetes' | 'mysql';
  /** Motivo por el que no se puede en este sistema, o null. */
  supports?: (os: RemoteOs) => string | null;
  plan: (os: RemoteOs) => InstallPlan | null;
  uninstall: (os: RemoteOs) => UninstallPlan | null;
}

export const INSTALLABLE = {
  nginx: { label: 'Nginx', plan: nginx, uninstall: nginxUninstall },
  docker: { label: 'Docker', plan: docker, uninstall: dockerUninstall },
  postgresql: { label: 'PostgreSQL', plan: postgresql, uninstall: postgresqlUninstall },
  mysql: { label: 'MySQL', group: 'mysql', supports: mysqlSupport, plan: mysql, uninstall: (os: RemoteOs) => mysqlFamilyUninstall(os, 'mysql') },
  mariadb: { label: 'MariaDB', group: 'mysql', plan: mariadb, uninstall: (os: RemoteOs) => mysqlFamilyUninstall(os, 'mariadb') },
  mongodb: { label: 'MongoDB', supports: mongodbSupport, plan: mongodb, uninstall: mongodbUninstall },
  redis: { label: 'Redis', plan: redis, uninstall: redisUninstall },
  nodejs: { label: 'Node.js', plan: nodejs, uninstall: nodejsUninstall },
  tailscale: { label: 'Tailscale', plan: tailscale, uninstall: tailscaleUninstall },
  wireguard: { label: 'WireGuard', plan: wireguard, uninstall: wireguardUninstall },
  fail2ban: { label: 'Fail2ban', plan: fail2ban, uninstall: fail2banUninstall },
  restic: { label: 'restic', plan: restic, uninstall: resticUninstall },
  k3s: { label: 'K3s', group: 'kubernetes', plan: k3s, uninstall: k3sUninstall },
  microk8s: { label: 'MicroK8s', group: 'kubernetes', supports: microk8sSupport, plan: microk8s, uninstall: microk8sUninstall },
  k0s: { label: 'k0s', group: 'kubernetes', plan: k0s, uninstall: k0sUninstall },
  rke2: { label: 'RKE2', group: 'kubernetes', supports: needsSystemd('RKE2'), plan: rke2, uninstall: rke2Uninstall },
} satisfies Record<string, Recipe>;

export type InstallableService = keyof typeof INSTALLABLE;

export const isInstallable = (name: string): name is InstallableService => name in INSTALLABLE;

/** Grupos del catálogo: `kubernetes` → k3s, microk8s, k0s, rke2. */
export const INSTALL_GROUPS = {
  kubernetes: ['k3s', 'microk8s', 'k0s', 'rke2'],
  mysql: ['mysql', 'mariadb'],
} as const satisfies Record<string, InstallableService[]>;
export type InstallGroup = keyof typeof INSTALL_GROUPS;
export const isInstallGroup = (name: string): name is InstallGroup => name in INSTALL_GROUPS;
