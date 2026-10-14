import { parsePods, parseTop, pickCli } from './kubernetes.service';

describe('pickCli', () => {
  it('kubectl con kubeconfig propio manda', () => {
    expect(pickCli('k3s=/usr/local/bin/k3s\nkubectl=/usr/local/bin/kubectl\nkubeconfig=1')).toEqual({ distribution: 'kubectl', base: '/usr/local/bin/kubectl' });
  });
  it('sin kubeconfig, el de la distribución', () => {
    expect(pickCli('k3s=/usr/local/bin/k3s\nkubectl=/usr/local/bin/kubectl')).toEqual({ distribution: 'k3s', base: '/usr/local/bin/k3s kubectl' });
    expect(pickCli('microk8s=/snap/bin/microk8s')).toEqual({ distribution: 'microk8s', base: '/snap/bin/microk8s kubectl' });
    expect(pickCli('rke2=/var/lib/rancher/rke2/bin/kubectl')?.base).toContain('--kubeconfig /etc/rancher/rke2/rke2.yaml');
  });
  it('nada instalado', () => {
    expect(pickCli('')).toBeNull();
  });
});

const pod = (over: Record<string, unknown>) => ({
  metadata: { namespace: 'default', name: 'web-7d9f8c6b5-abcde', creationTimestamp: '2026-10-13T10:00:00Z', ownerReferences: [{ kind: 'ReplicaSet', name: 'web-7d9f8c6b5', controller: true }] },
  spec: { nodeName: 'node-1', containers: [{ name: 'web', image: 'nginx:1.27' }, { name: 'sidecar', image: 'envoy:1' }] },
  status: {
    phase: 'Running', podIP: '10.42.0.5',
    containerStatuses: [
      { name: 'web', image: 'nginx:1.27', ready: true, restartCount: 0, state: { running: {} } },
      { name: 'sidecar', image: 'envoy:1', ready: false, restartCount: 4, state: { waiting: { reason: 'CrashLoopBackOff' } } },
    ],
  },
  ...over,
});

describe('parsePods', () => {
  it('estado como kubectl, listos, reinicios y dueño', () => {
    const [p] = parsePods(JSON.stringify({ items: [pod({})] }));
    expect(p).toMatchObject({
      namespace: 'default', status: 'CrashLoopBackOff', phase: 'Running', ready: 1, total: 2, restarts: 4,
      node: 'node-1', podIP: '10.42.0.5', owner: 'Deployment web',
    });
    expect(p.containers[1]).toEqual({ name: 'sidecar', image: 'envoy:1', ready: false, restarts: 4, state: 'waiting', reason: 'CrashLoopBackOff' });
  });
  it('borrándose es Terminating; sin estados de contenedor usa la spec', () => {
    const [p] = parsePods(JSON.stringify({ items: [pod({ metadata: { namespace: 'x', name: 'a', deletionTimestamp: 'now' }, status: { phase: 'Pending' } })] }));
    expect(p.status).toBe('Terminating');
    expect(p.total).toBe(2);
    expect(p.owner).toBeNull();
  });
});

describe('parseTop', () => {
  it('milicores y bytes', () => {
    const top = parseTop('default  web-1  250m  128Mi\nkube-system  coredns  1  1Gi\n');
    expect(top.get('default/web-1')).toEqual({ cpuMillicores: 250, memoryBytes: 128 * 1024 ** 2 });
    expect(top.get('kube-system/coredns')).toEqual({ cpuMillicores: 1000, memoryBytes: 1024 ** 3 });
  });
});
