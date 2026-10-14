import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Client as SSHClient } from 'ssh2';
import { ServersService } from '@servers/servers.service';
import { SSHService, SSHExecResult } from './ssh.service';
import { ServiceControlService, SudoStrategy } from './service-control.service';

export interface KubernetesContainer {
  name: string;
  image: string;
  ready: boolean;
  restarts: number;
  /** running, waiting o terminated, con el motivo si lo hay (CrashLoopBackOff…). */
  state: string;
  reason: string | null;
}

export interface KubernetesPod {
  namespace: string;
  name: string;
  /** Lo que pinta `kubectl get pods` en STATUS: Running, CrashLoopBackOff, Terminating… */
  status: string;
  phase: string;
  ready: number;
  total: number;
  restarts: number;
  createdAt: string | null;
  node: string | null;
  podIP: string | null;
  /** «Deployment web», «StatefulSet db», «DaemonSet kube-proxy»… */
  owner: string | null;
  containers: KubernetesContainer[];
  /** De `kubectl top` (metrics-server); null si no está instalado. */
  usage: { cpuMillicores: number; memoryBytes: number } | null;
}

export interface KubernetesPodsResult {
  /** Con qué se leyó: k3s, microk8s, rke2 o kubectl. */
  distribution: string;
  pods: KubernetesPod[];
  /** `kubectl top` respondió: hay consumo por pod. */
  metrics: boolean;
  readAt: string;
}

const EXEC_TIMEOUT_MS = 30_000;
/* Un clúster con miles de pods da un JSON de decenas de MB: se corta antes de agotar la memoria. */
const MAX_OUTPUT_BYTES = 40 * 1024 * 1024;

/* Qué CLI hay en el servidor. `command -v` no necesita privilegios. */
const DETECT_COMMAND = [
  'for c in k3s microk8s kubectl; do p=$(command -v $c 2>/dev/null) && echo "$c=$p"; done',
  'test -x /var/lib/rancher/rke2/bin/kubectl && echo rke2=/var/lib/rancher/rke2/bin/kubectl',
  'test -n "$KUBECONFIG" -o -r "$HOME/.kube/config" && echo kubeconfig=1',
  'true',
].join('; ');

export interface KubeCli {
  distribution: string;
  /** Prefijo del comando, sin `get pods`: un solo comando, para que sudo pueda anteponerse. */
  base: string;
}

/**
 * Elige el CLI: `kubectl` con un kubeconfig propio del usuario manda; si no,
 * el de la distribución, que sabe dónde está el suyo (k3s lee
 * /etc/rancher/k3s/k3s.yaml, que suele pedir root).
 */
export function pickCli(detected: string): KubeCli | null {
  const found = new Map(
    detected
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.includes('='))
      .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)] as const),
  );
  const kubectl = found.get('kubectl');
  if (kubectl && found.has('kubeconfig')) return { distribution: 'kubectl', base: kubectl };
  const k3s = found.get('k3s');
  if (k3s) return { distribution: 'k3s', base: `${k3s} kubectl` };
  const microk8s = found.get('microk8s');
  if (microk8s) return { distribution: 'microk8s', base: `${microk8s} kubectl` };
  const rke2 = found.get('rke2');
  if (rke2) return { distribution: 'rke2', base: `${rke2} --kubeconfig /etc/rancher/rke2/rke2.yaml` };
  if (kubectl) return { distribution: 'kubectl', base: kubectl };
  return null;
}

/* Lo que se lee de `kubectl get pods -o json`; el resto se ignora. */
type ContainerStateKey = 'running' | 'waiting' | 'terminated';
interface K8sContainerStatus {
  name: string;
  image?: string;
  ready?: boolean;
  restartCount?: number;
  state?: Partial<Record<ContainerStateKey, { reason?: string; exitCode?: number }>>;
}
interface K8sPod {
  metadata?: {
    namespace?: string;
    name?: string;
    creationTimestamp?: string;
    deletionTimestamp?: string;
    ownerReferences?: { kind: string; name: string; controller?: boolean }[];
  };
  spec?: { nodeName?: string; containers?: { name: string; image?: string }[] };
  status?: {
    phase?: string;
    reason?: string;
    podIP?: string;
    containerStatuses?: K8sContainerStatus[];
    initContainerStatuses?: K8sContainerStatus[];
  };
}

/** Quien creó el pod, con el nombre del Deployment en vez del ReplicaSet (`web-7d9f8c6b5` → `web`). */
function ownerOf(pod: K8sPod): string | null {
  const refs = pod.metadata?.ownerReferences ?? [];
  const ref = refs.find(r => r.controller) ?? refs[0];
  if (!ref) return null;
  const hash = /-[a-z0-9]{5,10}$/;
  if (ref.kind === 'ReplicaSet' && hash.test(ref.name)) return `Deployment ${ref.name.replace(hash, '')}`;
  return `${ref.kind} ${ref.name}`;
}

/**
 * STATUS como lo calcula `kubectl get pods`: el motivo del contenedor que
 * espera o terminó mal manda sobre la fase (CrashLoopBackOff, ErrImagePull,
 * OOMKilled…), y un pod que se está borrando es Terminating.
 */
function statusOf(pod: K8sPod, containers: KubernetesContainer[]): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';
  const init = pod.status?.initContainerStatuses ?? [];
  const stuck = init.find(c => c.state?.waiting?.reason || (c.state?.terminated && c.state.terminated.exitCode !== 0));
  if (stuck) return `Init:${stuck.state?.waiting?.reason ?? stuck.state?.terminated?.reason ?? 'Error'}`;
  const bad = containers.find(c => c.reason && c.state !== 'running');
  if (bad?.reason) return bad.reason;
  return pod.status?.reason ?? pod.status?.phase ?? 'Unknown';
}

function toContainer(c: K8sContainerStatus, specImage: string | undefined): KubernetesContainer {
  const state = (Object.keys(c.state ?? {})[0] as ContainerStateKey | undefined) ?? 'waiting';
  return {
    name: c.name,
    image: c.image ?? specImage ?? '',
    ready: Boolean(c.ready),
    restarts: c.restartCount ?? 0,
    state,
    reason: c.state?.[state]?.reason ?? null,
  };
}

export function parsePods(json: string): Omit<KubernetesPod, 'usage'>[] {
  const data = JSON.parse(json) as { items?: K8sPod[] };
  return (data.items ?? []).map(pod => {
    const spec = pod.spec?.containers ?? [];
    const images = new Map(spec.map(c => [c.name, c.image]));
    const statuses = pod.status?.containerStatuses ?? [];
    /* Recién creado aún no hay estados: los contenedores salen de la spec. */
    const source: K8sContainerStatus[] = statuses.length ? statuses : spec.map(c => ({ name: c.name, image: c.image }));
    const containers = source.map(c => toContainer(c, images.get(c.name)));
    return {
      namespace: pod.metadata?.namespace ?? 'default',
      name: pod.metadata?.name ?? '',
      status: statusOf(pod, containers),
      phase: pod.status?.phase ?? 'Unknown',
      ready: containers.filter(c => c.ready).length,
      total: containers.length,
      restarts: containers.reduce((n, c) => n + c.restarts, 0),
      createdAt: pod.metadata?.creationTimestamp ?? null,
      node: pod.spec?.nodeName ?? null,
      podIP: pod.status?.podIP ?? null,
      owner: ownerOf(pod),
      containers,
    };
  });
}

/** «250m» → 250 milicores; «1» → 1000. */
const cpuMillicores = (v: string): number => (v.endsWith('m') ? parseFloat(v) : parseFloat(v) * 1000) || 0;

const MEM_UNITS: Record<string, number> = {
  Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, K: 1e3, M: 1e6, G: 1e9, T: 1e12, '': 1,
};
const memoryBytes = (v: string): number => {
  const m = /^([\d.]+)([A-Za-z]*)$/.exec(v);
  return m ? Math.round(parseFloat(m[1]) * (MEM_UNITS[m[2]] ?? 1)) : 0;
};

/** `kubectl top pods -A --no-headers`: «ns  nombre  12m  34Mi» por línea. */
type PodUsage = NonNullable<KubernetesPod['usage']>;

export function parseTop(stdout: string): Map<string, PodUsage> {
  const out = new Map<string, PodUsage>();
  for (const line of stdout.split('\n')) {
    const [ns, name, cpu, mem] = line.trim().split(/\s+/);
    if (ns && name && cpu && mem) out.set(`${ns}/${name}`, { cpuMillicores: cpuMillicores(cpu), memoryBytes: memoryBytes(mem) });
  }
  return out;
}

/* Errores de permisos al leer el kubeconfig: se reintenta con sudo. */
const NEEDS_SUDO = /permission denied|insufficient permissions|unable to read|open \/etc\/rancher/i;

@Injectable()
export class KubernetesService {
  private readonly logger = new Logger(KubernetesService.name);

  constructor(
    private readonly sshService: SSHService,
    private readonly serversService: ServersService,
    private readonly serviceControl: ServiceControlService,
  ) {}

  /**
   * Pods de todos los namespaces con su estado y, si hay metrics-server, su
   * consumo. Solo lectura. Se intenta sin sudo y se escala si el kubeconfig
   * no se deja leer (k3s y microk8s lo dejan solo para root).
   */
  async listPods(serverId: string, userId: string, sudoPassword?: string): Promise<KubernetesPodsResult> {
    const server = await this.serversService.findOneWithPrivateKey(serverId, userId);

    let conn: SSHClient | null = null;
    try {
      conn = await this.sshService.createDedicatedClient(server);
      const detected = await this.sshService.execOnClient(conn, DETECT_COMMAND, { timeoutMs: 15_000 });
      const cli = pickCli(detected.stdout);
      if (!cli) {
        throw new ServiceUnavailableException({
          code: 'KUBERNETES_UNAVAILABLE',
          message: `No se encontró kubectl en ${server.host}.`,
          hint: 'El panel busca kubectl, k3s, microk8s y rke2. Instala kubectl o añade el de tu distribución al PATH.',
        });
      }

      const getPods = `${cli.base} get pods -A -o json`;
      let sudo: SudoStrategy | null = null;
      let pods = await this.exec(conn, null, getPods);
      if (pods.code !== 0 && NEEDS_SUDO.test(pods.stderr)) {
        sudo = await this.serviceControl.resolveSudo(conn, server, sudoPassword);
        pods = await this.exec(conn, sudo, getPods);
      }

      if (pods.code !== 0) {
        this.logger.warn(`kubectl get pods falló en ${server.host}: ${pods.stderr.trim()}`);
        throw new ServiceUnavailableException({
          code: 'KUBERNETES_UNAVAILABLE',
          message: /connection refused|unable to connect|no such host|was refused/i.test(pods.stderr)
            ? `El clúster de Kubernetes no responde en ${server.host}.`
            : `No se pudieron leer los pods en ${server.host}.`,
          hint: pods.stderr.trim().slice(0, 300) || undefined,
        });
      }
      if (pods.truncated) {
        throw new ServiceUnavailableException({
          code: 'KUBERNETES_TOO_LARGE',
          message: 'El clúster tiene demasiados pods para leerlos de una vez.',
        });
      }

      const parsed = parsePods(pods.stdout);
      /* metrics-server es opcional: sin él, los pods van sin consumo. */
      const top = parsed.length > 0 ? await this.exec(conn, sudo, `${cli.base} top pods -A --no-headers`) : null;
      const usage = top?.code === 0 ? parseTop(top.stdout) : new Map<string, PodUsage>();

      return {
        distribution: cli.distribution,
        pods: parsed.map(p => ({ ...p, usage: usage.get(`${p.namespace}/${p.name}`) ?? null })),
        metrics: top?.code === 0,
        readAt: new Date().toISOString(),
      };
    } finally {
      conn?.end();
    }
  }

  private exec(conn: SSHClient, sudo: SudoStrategy | null, command: string): Promise<SSHExecResult> {
    return sudo
      ? this.serviceControl.run(conn, sudo, command, EXEC_TIMEOUT_MS, { maxOutputBytes: MAX_OUTPUT_BYTES })
      : this.sshService.execOnClient(conn, command, { timeoutMs: EXEC_TIMEOUT_MS, maxOutputBytes: MAX_OUTPUT_BYTES });
  }
}
