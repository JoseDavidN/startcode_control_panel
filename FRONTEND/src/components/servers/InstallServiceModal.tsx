import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { openUrl } from '@tauri-apps/plugin-opener';
import { copyText } from '@lib/clipboard';
import { notify } from '@services/notification.service';
import { Modal } from '@components/common/Modal';
import { useServiceInstall } from '@hooks/useServiceInstall';
import { serviceInstallService, type InstallMode, type InstallStep } from '@services/service-install.service';
import { SERVICE_LOGOS } from '@components/servers/serviceLogos';

/* Servicios del catálogo. `ready`: ya tiene receta en el backend; el resto se
   ve pero aún no se puede instalar. Para añadir uno: su logo en
   `serviceLogos.ts` y su receta en `install-recipes.ts` del backend. */
interface Variant { id: string; name: string; desc: string; logo: string }

/* Kubernetes se elige entre las distribuciones de un nodo más usadas. */
const KUBERNETES_VARIANTS: Variant[] = [
  { id: 'k3s',      name: 'K3s',      logo: 'k3s',        desc: 'De Rancher (SUSE). Un solo binario y pocos recursos: el más usado para un nodo, edge o laboratorio' },
  { id: 'microk8s', name: 'MicroK8s', logo: 'canonical',  desc: 'De Canonical, por snap. Complementos (DNS, ingress, almacenamiento) con un comando' },
  { id: 'k0s',      name: 'k0s',      logo: 'kubernetes', desc: 'De Mirantis. Un binario sin dependencias del sistema, Kubernetes sin modificar' },
  { id: 'rke2',     name: 'RKE2',     logo: 'rancher',    desc: 'De Rancher, endurecido para seguridad (CIS). El más completo; tarda más en arrancar' },
];

/* MySQL de Oracle solo está en Ubuntu y RHEL/Fedora; MariaDB, compatible, en todas. */
const MYSQL_VARIANTS: Variant[] = [
  { id: 'mysql',   name: 'MySQL',   logo: 'mysql',   desc: 'El de Oracle. En Ubuntu y en RHEL, Rocky, Alma y Fedora' },
  { id: 'mariadb', name: 'MariaDB', logo: 'mariadb', desc: 'Compatible con MySQL (mismos clientes y protocolo). En todas las distribuciones' },
];

const CATALOG: readonly { type: string; name: string; desc: string; ready: boolean; variants?: Variant[] }[] = [
  { type: 'nginx',      name: 'Nginx',      desc: 'Servidor web y proxy',      ready: true },
  { type: 'kubernetes', name: 'Kubernetes', desc: 'Orquestación de contenedores', ready: true, variants: KUBERNETES_VARIANTS },
  { type: 'docker',     name: 'Docker',     desc: 'Contenedores',              ready: true },
  { type: 'mysql',      name: 'MySQL',      desc: 'Base de datos relacional',  ready: true, variants: MYSQL_VARIANTS },
  { type: 'postgresql', name: 'PostgreSQL', desc: 'Base de datos avanzada',    ready: true },
  { type: 'redis',      name: 'Redis',      desc: 'Cache en memoria',          ready: true },
  { type: 'mongodb',    name: 'MongoDB',    desc: 'Base de datos NoSQL',       ready: true },
  { type: 'nodejs',     name: 'Node.js',    desc: 'Runtime JavaScript',        ready: true },
  { type: 'proxmox',    name: 'Proxmox VE', desc: 'Virtualización: VMs y contenedores', ready: false },
  { type: 'fail2ban',   name: 'Fail2ban',   desc: 'Bloquea IPs con intentos de acceso fallidos', ready: true },
  { type: 'tailscale',  name: 'Tailscale',  desc: 'Red privada (VPN) sin configurar puertos',    ready: true },
  { type: 'wireguard',  name: 'WireGuard',  desc: 'VPN rápida y moderna',      ready: true },
  { type: 'restic',     name: 'restic',     desc: 'Copias de seguridad cifradas', ready: true },
];
type CatalogItem = (typeof CATALOG)[number];

/* Lo que hace cada operación, para confirmarla antes de tocar el servidor. */
const KUBE_COMMON_INSTALL = 'Deja el nodo como plano de control y trabajador, y espera a que esté listo (puede tardar unos minutos)';
const WHAT_IT_DOES: Record<string, string[]> = {
  nginx: [
    'Detecta el sistema y su gestor de paquetes (apt, dnf, yum, zypper, apk o pacman)',
    'Instala el paquete nginx de los repositorios del sistema',
    'Lo arranca y lo deja habilitado al iniciar el servidor',
    'Comprueba que responde y muestra la versión instalada',
  ],
  docker: [
    'Debian y Ubuntu: instalador oficial (get.docker.com); RHEL, Rocky, Alma, CentOS y Fedora: repositorio oficial de Docker; el resto: paquete de la distribución',
    'Instala Docker Engine, la CLI, containerd, buildx y compose',
    'Lo arranca y lo deja habilitado al iniciar el servidor',
    'Comprueba que responde y muestra la versión instalada',
  ],
  postgresql: [
    'Instala PostgreSQL del sistema (en RHEL y familia crea el clúster con postgresql-setup; en Arch y Alpine, con initdb)',
    'Lo arranca, lo deja habilitado al iniciar y escuchando solo en el propio servidor',
    'Comprueba que responde y muestra la versión instalada',
  ],
  mysql: ['Instala mysql-server de los repositorios del sistema', 'Lo arranca, lo deja habilitado y escuchando solo en el propio servidor (root entra por el socket local)', 'Comprueba que responde y muestra la versión instalada'],
  mariadb: ['Instala mariadb-server (en Alpine y Arch también crea el directorio de datos)', 'Lo arranca, lo deja habilitado y escuchando solo en el propio servidor (root entra por el socket local)', 'Comprueba que responde y muestra la versión instalada'],
  mongodb: [
    'Añade el repositorio oficial de MongoDB 8.0 con su clave (no está en las distribuciones)',
    'Instala mongodb-org (servidor, mongosh y herramientas), lo arranca y lo deja habilitado, escuchando solo en el propio servidor',
    'Requisitos: Ubuntu 20.04–24.04, Debian 12 o RHEL/Rocky/Alma 8–9, y un procesador con AVX',
  ],
  redis: ['Instala Redis del sistema (en RHEL y familia desde EPEL si hace falta; en Arch puede ser Valkey, compatible)', 'Lo arranca, lo deja habilitado y escuchando solo en el propio servidor', 'Comprueba que responde y muestra la versión instalada'],
  nodejs: [
    'Debian, Ubuntu, RHEL, Rocky, Alma y Fedora: la versión LTS desde el repositorio oficial de NodeSource; si no lo admite, la de la distribución',
    'openSUSE, Alpine y Arch: el paquete de la distribución',
    'Instala node, npm y npx. No es un servicio: no se arranca nada',
    'Comprueba y muestra las versiones de Node.js y npm',
  ],
  tailscale: [
    'Debian, Ubuntu, RHEL, Rocky, Alma, Fedora y openSUSE: el instalador oficial (tailscale.com/install.sh), que añade su repositorio; Alpine y Arch: el paquete de la distribución',
    'Arranca tailscaled y lo deja habilitado al iniciar',
    'Te da el enlace para iniciar sesión en Tailscale y unir este servidor a tu red; si ya estaba vinculado, muestra su IP de Tailscale',
    'No cambia las rutas del servidor ni acepta las de otros nodos',
  ],
  fail2ban: [
    'Instala fail2ban del sistema (en RHEL y familia desde EPEL, sin atarlo a firewalld)',
    'Activa la protección de SSH en el puerto real de sshd: bloquea 1 h una IP con 5 accesos fallidos en 10 minutos',
    'La IP desde la que entra el panel y el propio servidor quedan en la lista blanca: nunca se bloquean',
    'Bloquea con firewalld si está activo, si no con nftables o iptables; lo arranca, lo deja habilitado y comprueba que la protección está cargada',
  ],
  restic: [
    'Descarga la última versión oficial de restic (GitHub), comprueba su suma SHA-256 y la instala en /usr/local/bin; si no se puede, la de la distribución',
    'Instala curl y bzip2 si faltan',
    'Es una herramienta, no un servicio: no se arranca nada ni se crea ninguna copia todavía',
    'Muestra cómo crear el primer repositorio de copias',
  ],
  wireguard: [
    'Instala wireguard-tools (sin DKMS: el kernel trae WireGuard desde Linux 5.6)',
    'Crea la interfaz wg0 con su par de claves, en la primera subred 10.x.0.0/24 libre y el primer puerto UDP libre desde 51820; si ya hay un wg0.conf, lo respeta',
    'Abre ese puerto en ufw o firewalld si están activos, levanta wg0 y la deja habilitada al iniciar',
    'Muestra la dirección, el puerto y la clave pública para añadir los pares (clientes)',
  ],
  k3s: ['Instala curl si falta y ejecuta el instalador oficial (get.k3s.io)', 'Crea el servicio k3s con su red (flannel), DNS y almacenamiento local', KUBE_COMMON_INSTALL],
  microk8s: ['Instala snapd si falta (en RHEL y familia, desde EPEL)', 'Instala el snap microk8s (--classic)', KUBE_COMMON_INSTALL],
  k0s: ['Instala curl si falta y descarga k0s con su instalador oficial (get.k0s.sh)', 'Lo instala como controlador de un solo nodo (k0s install controller --single) y lo arranca', KUBE_COMMON_INSTALL],
  rke2: ['Instala curl si falta y ejecuta el instalador oficial (get.rke2.io)', 'Habilita y arranca rke2-server; el primer arranque descarga sus imágenes', KUBE_COMMON_INSTALL],
};

const KUBE_COMMON_UNINSTALL = 'Borra reglas de iptables de Kubernetes, interfaces de red (cni0, flannel, Calico…) y la configuración CNI de Kubernetes, y comprueba que no queda rastro';

/* Desinstalar es completo: el servidor queda como si nunca se hubiera instalado. */
const WHAT_UNINSTALL_DOES: Record<string, string[]> = {
  nginx: [
    'Detiene nginx y lo quita del arranque del sistema',
    'Purga los paquetes nginx y sus módulos, y las dependencias que quedan sin uso',
    'Borra configuración (/etc/nginx), registros, caché, contenido por defecto, unidades del sistema y el usuario nginx',
    'Comprueba que no queda ningún rastro. Tus sitios en /var/www no se tocan',
  ],
  docker: [
    'Detiene Docker y containerd y los quita del arranque',
    'Purga los paquetes de Docker (engine, CLI, containerd.io, buildx, compose) y las dependencias que quedan sin uso',
    'Borra todas las imágenes, contenedores, volúmenes y redes (/var/lib/docker), la configuración, el repositorio y su clave, el grupo docker y los ~/.docker',
    'Quita docker0, los puentes de las redes de Docker y sus reglas de iptables, y comprueba que no queda rastro. runc y los datos de containerd que otro programa siga usando se conservan',
  ],
  postgresql: [
    'Detiene PostgreSQL y lo quita del arranque',
    'Purga los paquetes de PostgreSQL y las dependencias que quedan sin uso (libpq se conserva si otro programa la usa)',
    'Borra TODAS las bases de datos y el clúster, la configuración, los registros, el historial de psql y el usuario postgres',
    'Comprueba que no queda rastro',
  ],
  mysql: ['Detiene MySQL y lo quita del arranque', 'Purga los paquetes de MySQL (las bibliotecas cliente que usen PHP u otros se conservan si siguen en uso)', 'Borra TODAS las bases de datos (/var/lib/mysql), la configuración, los registros, el historial y el usuario mysql', 'Comprueba que no queda rastro'],
  mariadb: ['Detiene MariaDB y lo quita del arranque', 'Purga los paquetes de MariaDB y Galera (las bibliotecas cliente en uso se conservan)', 'Borra TODAS las bases de datos (/var/lib/mysql), la configuración, los registros, el historial y el usuario mysql', 'Comprueba que no queda rastro'],
  mongodb: ['Detiene mongod y lo quita del arranque', 'Purga los paquetes de MongoDB y quita su repositorio y su clave', 'Borra TODAS las bases de datos, la configuración, los registros, el historial de mongosh y los usuarios mongodb/mongod', 'Comprueba que no queda rastro'],
  redis: ['Detiene Redis (o Valkey) y lo quita del arranque', 'Purga sus paquetes', 'Borra todos los datos guardados, la configuración, los registros, el historial de redis-cli y el usuario redis', 'Comprueba que no queda rastro'],
  nodejs: [
    'Purga los paquetes de Node.js y npm, y las dependencias que quedan sin uso',
    'Quita el repositorio de NodeSource y su clave',
    'Borra los paquetes globales de npm (pm2, yarn…) y sus comandos, las cachés y la configuración de npm y node-gyp, y los historiales',
    'Comprueba que no queda rastro. Los node_modules de tus proyectos no se tocan',
  ],
  tailscale: [
    'Si el panel entra por SSH a través de Tailscale, no se desinstala: cortaría el acceso',
    'Cierra la sesión del servidor en tu red Tailscale (desaparece de la consola), detiene tailscaled y lo quita del arranque',
    'Purga los paquetes y quita el repositorio oficial y su clave',
    'Borra el estado y la identidad del nodo (/var/lib/tailscale), la caché, la configuración, la interfaz tailscale0 y sus reglas de iptables, y comprueba que no queda rastro',
  ],
  fail2ban: [
    'Detiene fail2ban, que quita todos sus bloqueos, y lo quita del arranque',
    'Purga sus paquetes y las dependencias que quedan sin uso',
    'Borra la configuración (/etc/fail2ban), la base de bloqueos, los registros y cualquier regla f2b que quede en iptables, nftables o ipset',
    'Comprueba que no queda rastro',
  ],
  restic: [
    'Borra el binario de restic y purga el paquete de la distribución si lo hay',
    'Borra las cachés de restic y el autocompletado',
    'Comprueba que no queda rastro. Tus repositorios de copias NO se tocan, estén donde estén',
  ],
  wireguard: [
    'Si el panel entra por SSH a través de WireGuard, no se desinstala: cortaría el acceso',
    'Baja TODAS las interfaces WireGuard (no solo wg0) y las quita del arranque, y cierra su puerto en ufw o firewalld',
    'Purga wireguard-tools y borra /etc/wireguard con todas sus configuraciones y claves',
    'Comprueba que no queda rastro. El módulo del kernel es parte del sistema y se conserva',
  ],
  k3s: ['Ejecuta k3s-uninstall.sh: detiene k3s, borra el servicio, binarios (k3s, kubectl, crictl) y montajes', 'Borra /etc/rancher/k3s, /var/lib/rancher/k3s con todas las imágenes y volúmenes locales, y /var/lib/kubelet', KUBE_COMMON_UNINSTALL],
  microk8s: ['Detiene MicroK8s y quita el snap con --purge (sin instantánea de datos)', 'Borra /var/snap/microk8s, los datos de usuario y el grupo microk8s. snapd se conserva', KUBE_COMMON_UNINSTALL],
  k0s: ['Detiene k0s y ejecuta k0s reset: servicios, datos y montajes del nodo', 'Borra el binario, /etc/k0s, /var/lib/k0s y /var/lib/kubelet', KUBE_COMMON_UNINSTALL],
  rke2: ['Detiene rke2 y ejecuta rke2-uninstall.sh (paquetes, binarios y servicio)', 'Borra /etc/rancher/rke2, /var/lib/rancher/rke2 con sus imágenes y /var/lib/kubelet', KUBE_COMMON_UNINSTALL],
};

const sp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const CheckIcon = () => <svg {...sp} className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></svg>;
const CrossIcon = () => <svg {...sp} className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12" /></svg>;
const SkipIcon = () => <svg {...sp} className="w-3.5 h-3.5"><path d="M5 12h14" /></svg>;
const BackIcon = () => <svg {...sp} className="w-4 h-4"><path d="M15 18l-6-6 6-6" /></svg>;

/* Luminancia relativa del color de marca: los muy oscuros no se verían en los temas oscuros. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const Logo = ({ type, size = 'w-8 h-8' }: { type: string; size?: string }) => {
  const logo = SERVICE_LOGOS[type];
  if (!logo) return null;
  if ('image' in logo) return <img src={logo.image} alt="" aria-hidden className={`${size} rounded-md object-contain`} />;
  /* La forma siempre es la real; un color de marca casi negro (MariaDB) toma la tinta del tema. */
  const dark = luminance(logo.hex) < 0.05;
  return (
    <svg viewBox="0 0 24 24" className={`${size} ${dark ? 'text-white/90' : ''}`} role="img" aria-hidden>
      <path d={logo.path} fill={dark ? 'currentColor' : logo.hex} />
    </svg>
  );
};

/* Un paso con su icono de estado; el que corre gira. */
const StepRow = ({ step }: { step: InstallStep }) => {
  const icon = step.status === 'done' ? <CheckIcon />
    : step.status === 'failed' ? <CrossIcon />
      : step.status === 'skipped' ? <SkipIcon />
        : step.status === 'running' ? <span className="w-3.5 h-3.5 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
          : <span className="w-1.5 h-1.5 rounded-full bg-white/25" />;
  const tone = step.status === 'done' ? 'bg-emerald-500/15 text-emerald-300'
    : step.status === 'failed' ? 'bg-rose-500/15 text-rose-300'
      : step.status === 'running' ? 'bg-violet-500/15 text-violet-300' : 'bg-tint-active text-white/40';
  return (
    <li className="flex items-start gap-3">
      <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>{icon}</span>
      <span className="min-w-0 pt-0.5">
        <span className={`block text-sm ${step.status === 'pending' ? 'text-white/45' : 'text-white/85'}`}>{step.label}</span>
        {step.detail && <span className={`block text-xs font-mono truncate ${step.status === 'failed' ? 'text-rose-300/80' : 'text-white/45'}`} title={step.detail}>{step.detail}</span>}
      </span>
    </li>
  );
};

interface ApiErrorLike { code?: string; message?: string; hint?: string }

const Spinner = () => <span className="w-4 h-4 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin shrink-0" />;

/**
 * Instalar o desinstalar un servicio en el servidor con el mismo botón: al
 * elegirlo se comprueba si ya está; si no, se ofrece instalarlo; si ya está,
 * se avisa y se pide confirmar una desinstalación completa. El modal no cambia
 * de tamaño: el catálogo desplaza dentro de un alto fijo y el resto de vistas
 * ocupa ese mismo hueco.
 */
export const InstallServiceModal = ({ serverId, serverName, isOpen, onClose }: {
  serverId: string;
  serverName: string;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  /* En un grupo (Kubernetes): la distribución elegida para instalar. */
  const [variant, setVariant] = useState<Variant | null>(null);
  const [sudoDraft, setSudoDraft] = useState('');
  /* La contraseña aceptada se reutiliza al reintentar; no sale del modal. */
  const [sudoPassword, setSudoPassword] = useState<string | undefined>();
  const install = useServiceInstall(serverId);
  const apiError = (install.error ?? null) as ApiErrorLike | null;
  const needsSudo = apiError?.code === 'SUDO_REQUIRED' || apiError?.code === 'SUDO_PASSWORD';
  const result = install.data;
  const busy = install.isPending;

  /* ¿Ya está instalado? Se pregunta cada vez que se elige el servicio. */
  const status = useQuery({
    queryKey: ['serviceInstallStatus', serverId, selected?.type],
    queryFn: () => serviceInstallService.status(serverId, selected!.type),
    enabled: Boolean(selected),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const mode: InstallMode = status.data?.installed ? 'uninstall' : 'install';
  const uninstalling = mode === 'uninstall';
  /* Lo que se instala o desinstala de verdad: la distribución en un grupo, el servicio si no. */
  const installedVariant = selected?.variants?.find(v => v.id === status.data?.variant) ?? null;
  const target = selected?.variants ? (installedVariant ?? variant) : null;
  const targetId = selected?.variants ? target?.id ?? null : selected?.type ?? null;
  const targetName = target?.name ?? selected?.name ?? '';
  const targetLogo = target?.logo ?? selected?.type ?? '';
  /* Grupo sin nada instalado y sin elegir: primero se elige la distribución. */
  const picking = Boolean(selected?.variants && status.data && !status.data.installed && !variant);
  const support = (id: string) => status.data?.options?.find(o => o.id === id);
  /* Servicio suelto que este sistema no admite: se dice antes de intentar instalar. */
  const blocked = !uninstalling && !selected?.variants ? status.data?.unsupported ?? null : null;

  const reset = () => { setSudoDraft(''); install.reset(); };
  const close = () => {
    if (busy) return;
    setSelected(null);
    setVariant(null);
    setSudoPassword(undefined);
    reset();
    onClose();
  };
  /* Volver: de la confirmación de una distribución, a elegir otra; si no, al catálogo. */
  const back = () => {
    if (variant && !result && !busy) { setVariant(null); reset(); return; }
    setSelected(null); setVariant(null); reset();
  };
  const run = (password = sudoPassword) => {
    if (!targetId) return;
    if (password !== sudoPassword) setSudoPassword(password);
    install.mutate({ mode, service: targetId, sudoPassword: password });
  };

  const started = busy || Boolean(result) || (install.isError && !needsSudo);
  const title = !selected ? 'Instalar Nuevo Servicio'
    : status.isLoading || picking ? selected.name
      : uninstalling ? `Desinstalar ${targetName}` : `Instalar ${targetName}`;
  const actionLabel = uninstalling ? 'Desinstalar por completo' : 'Instalar';

  return (
    <Modal isOpen={isOpen} onClose={close} title={title} size="md" dismissable={!busy}>
      {/* Mismo alto en todas las vistas: el modal no salta al cambiar de paso. */}
      <div className="h-[372px] flex flex-col">
        {!selected ? (
          <>
            <p className="text-xs text-white/45 mb-3 leading-relaxed">
              Si el servicio ya está instalado en {serverName}, el mismo botón ofrece desinstalarlo por completo.
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin -mr-2 pr-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {CATALOG.map(item => (
                  <button key={item.type} type="button" disabled={!item.ready} onClick={() => setSelected(item)}
                    title={item.ready ? `Instalar o desinstalar ${item.name} en ${serverName}${item.variants ? ` (${item.variants.map(v => v.name).join(', ')})` : ''}` : 'Disponible próximamente'}
                    className="relative p-4 rounded-xl glass-soft row-hit hover:border-hairline-strong transition text-left disabled:cursor-not-allowed disabled:opacity-55">
                    <div className="mb-2"><Logo type={item.type} /></div>
                    <p className="text-sm font-semibold text-white mb-0.5">{item.name}</p>
                    <p className="text-xs text-white/45">{item.desc}</p>
                    {!item.ready && (
                      <span className="absolute top-2.5 right-2.5 text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-tint-active text-white/50 ring-1 ring-hairline">
                        Próximamente
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-12 h-12 rounded-xl glass-soft flex items-center justify-center shrink-0"><Logo type={targetLogo} size="w-7 h-7" /></span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{target ? `${selected.name} · ${target.name}` : selected.name}</p>
                <p className="text-xs text-white/45 truncate">
                  {selected.desc} · en {serverName}{status.data ? ` · ${status.data.os.name}` : ''}
                </p>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
              {status.isLoading ? (
                <div className="flex items-center gap-3 text-sm text-white/60"><Spinner /> Comprobando si {selected.name} ya está instalado…</div>
              ) : picking ? (
                <div className="space-y-2">
                  <p className="text-xs text-white/50 mb-1">Elige la distribución que quieres instalar en este servidor:</p>
                  {selected.variants!.map(v => {
                    const opt = support(v.id);
                    const ok = opt?.supported ?? true;
                    return (
                      <button key={v.id} type="button" disabled={!ok} onClick={() => setVariant(v)}
                        title={ok ? `Instalar ${v.name}` : opt?.reason ?? undefined}
                        className="w-full text-left glass-soft row-hit rounded-xl p-3 flex items-start gap-3 hover:border-hairline-strong transition disabled:opacity-50 disabled:cursor-not-allowed">
                        <span className="w-9 h-9 rounded-lg glass-soft flex items-center justify-center shrink-0"><Logo type={v.logo} size="w-5 h-5" /></span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-white">{v.name}</span>
                          <span className="block text-xs text-white/50 leading-snug">{ok ? v.desc : opt?.reason}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : status.isError ? (
                <div className="glass-soft rounded-xl p-3 border border-rose-400/20">
                  <p className="text-sm text-rose-300">{(status.error as ApiErrorLike | null)?.message ?? 'No se pudo comprobar el servidor'}</p>
                </div>
              ) : started ? (
                <ul className="space-y-3">
                  {(install.steps.length ? install.steps : [{ id: 'ssh', label: 'Conexión SSH', status: 'running' as const }]).map(s => <StepRow key={s.id} step={s} />)}
                </ul>
              ) : needsSudo ? (
                <div className="space-y-3">
                  <div className="glass-soft rounded-xl p-4">
                    <p className="text-sm font-semibold text-white mb-1">Hace falta sudo</p>
                    <p className="text-xs text-white/60 leading-relaxed">
                      {apiError?.code === 'SUDO_PASSWORD' ? apiError.message : apiError?.hint ?? 'El usuario SSH no es root y sudo pide contraseña.'}
                    </p>
                  </div>
                  <div className="glass-input rounded-xl h-11 flex items-center px-3.5">
                    <input autoFocus type="password" autoComplete="off" value={sudoDraft} onChange={e => setSudoDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && sudoDraft) run(sudoDraft); }}
                      placeholder="Contraseña del usuario SSH" className="w-full bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25" />
                  </div>
                  <p className="text-[11px] text-white/40">Se usa solo para esta operación y no se guarda.</p>
                </div>
              ) : uninstalling ? (
                <div className="space-y-3">
                  <div className="glass-soft rounded-xl p-3 border border-amber-400/25">
                    <p className="text-sm text-amber-300 font-medium">
                      {targetName}{status.data?.version ? ` · ${status.data.version}` : ''} ya está instalado en este servidor
                    </p>
                    <p className="text-xs text-white/60 mt-1 leading-relaxed">
                      ¿Quieres desinstalarlo por completo? No quedará rastro del servicio, como si nunca se hubiera instalado. No se puede deshacer.
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {(WHAT_UNINSTALL_DOES[targetId ?? ''] ?? []).map(line => (
                      <li key={line} className="flex items-start gap-2.5 text-sm text-white/70">
                        <span className="text-rose-300 mt-0.5 shrink-0"><CrossIcon /></span>{line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : blocked ? (
                <div className="glass-soft rounded-xl p-3 border border-amber-400/25">
                  <p className="text-sm text-amber-300 font-medium">No se puede instalar {targetName} en este servidor</p>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">{blocked}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {(WHAT_IT_DOES[targetId ?? ''] ?? []).map(line => (
                    <li key={line} className="flex items-start gap-2.5 text-sm text-white/70">
                      <span className="text-violet-300 mt-0.5 shrink-0"><CheckIcon /></span>{line}
                    </li>
                  ))}
                </ul>
              )}

              {result && (
                result.ok ? (
                  <div className="mt-4 glass-soft rounded-xl p-3 border border-emerald-400/20">
                    <p className="text-sm text-emerald-300 font-medium">
                      {result.mode === 'uninstall'
                        ? `${targetName} se desinstaló por completo: no queda rastro en el servidor`
                        : result.alreadyInstalled ? `${targetName} ya estaba instalado y está en marcha` : `${targetName} instalado y en marcha`}
                    </p>
                    {result.mode === 'install' && <p className="text-xs text-white/50 mt-0.5">{[result.version, result.os?.name].filter(Boolean).join(' · ')}</p>}
                    {result.mode === 'install' && result.access && (
                      <div className="mt-3 pt-3 border-t border-line space-y-2">
                        {result.access.url && (
                          <button type="button" onClick={() => void openUrl(result.access!.url!).catch(() => notify.error('No se pudo abrir el navegador', result.access!.url!))}
                            className="grad-brand text-sm font-semibold px-4 h-9 rounded-xl elev-brand-sm hover:elev-brand transition inline-flex items-center gap-2">
                            Vincular a tu red
                            <svg {...sp} className="w-3.5 h-3.5"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
                          </button>
                        )}
                        {result.access.info.map(line => <p key={line} className="text-xs text-white/65 leading-relaxed">{line}</p>)}
                        {result.access.key && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] uppercase tracking-wider text-white/40 font-semibold shrink-0">Clave pública</span>
                            <code className="flex-1 min-w-0 truncate text-xs font-mono text-white/85 bg-tint-sunken rounded-lg px-2 py-1" title={result.access.key}>{result.access.key}</code>
                            <button type="button" title="Copiar la clave pública"
                              onClick={() => void copyText(result.access!.key!).then(() => notify.success('Clave pública copiada'), () => notify.error('No se pudo copiar'))}
                              className="h-7 px-2.5 rounded-lg glass-soft row-hit text-white/75 hover:text-white text-xs font-medium shrink-0">
                              Copiar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 glass-soft rounded-xl p-3 border border-rose-400/20">
                    <p className="text-sm text-rose-300 font-medium">{result.error?.message ?? 'No se pudo completar'}</p>
                    {result.error?.detail && <pre className="text-[11px] font-mono text-white/50 mt-1.5 whitespace-pre-wrap break-all max-h-28 overflow-y-auto scroll-thin">{result.error.detail}</pre>}
                  </div>
                )
              )}
              {install.isError && !needsSudo && (
                <div className="mt-4 glass-soft rounded-xl p-3 border border-rose-400/20">
                  <p className="text-sm text-rose-300">{apiError?.message ?? 'No se pudo completar'}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-line">
              <button type="button" onClick={back} disabled={busy}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm text-white/65 hover:text-white hover:bg-tint-hover transition disabled:opacity-40">
                <BackIcon /> {variant && !result && !busy ? 'Distribuciones' : 'Catálogo'}
              </button>
              {result?.ok ? (
                <button type="button" onClick={close} className="grad-brand text-sm font-semibold px-5 h-10 rounded-xl elev-brand hover:elev-brand-hi transition">Listo</button>
              ) : status.isError ? (
                <button type="button" onClick={() => void status.refetch()} className="grad-brand text-sm font-semibold px-5 h-10 rounded-xl elev-brand hover:elev-brand-hi transition">Reintentar</button>
              ) : (
                <button type="button" disabled={busy || status.isLoading || picking || !targetId || Boolean(blocked) || (needsSudo && !sudoDraft)}
                  onClick={() => run(needsSudo ? sudoDraft : sudoPassword)}
                  className={uninstalling
                    ? 'h-10 px-5 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-sm font-semibold transition disabled:opacity-50'
                    : 'grad-brand text-sm font-semibold px-5 h-10 rounded-xl elev-brand hover:elev-brand-hi transition disabled:opacity-50'}>
                  {busy ? (uninstalling ? 'Desinstalando…' : 'Instalando…') : result || install.isError ? 'Reintentar' : needsSudo ? 'Continuar' : actionLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
