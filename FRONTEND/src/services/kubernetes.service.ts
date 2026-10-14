import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';

export interface KubernetesContainer {
  name: string;
  image: string;
  ready: boolean;
  restarts: number;
  /** running, waiting o terminated. */
  state: string;
  reason: string | null;
}

export interface KubernetesPod {
  namespace: string;
  name: string;
  /** STATUS de `kubectl get pods`: Running, CrashLoopBackOff, Terminating… */
  status: string;
  phase: string;
  ready: number;
  total: number;
  restarts: number;
  createdAt: string | null;
  node: string | null;
  podIP: string | null;
  /** «Deployment web», «StatefulSet db»… */
  owner: string | null;
  containers: KubernetesContainer[];
  /** De metrics-server; null si no está instalado. */
  usage: { cpuMillicores: number; memoryBytes: number } | null;
}

export interface KubernetesPodsResult {
  /** k3s, microk8s, rke2 o kubectl. */
  distribution: string;
  pods: KubernetesPod[];
  metrics: boolean;
  readAt: string;
}

export const kubernetesService = {
  /** Pods de todos los namespaces, leídos por SSH. POST: puede llevar la contraseña de sudo. */
  async listPods(serverId: string, sudoPassword?: string): Promise<KubernetesPodsResult> {
    const response = await apiService.post<KubernetesPodsResult>(
      `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/kubernetes/pods`,
      sudoPassword ? { sudoPassword } : {},
      { timeout: 60_000 },
    );
    const payload = (response as unknown as { data?: unknown })?.data ?? response;
    return ((payload as { data?: unknown })?.data ?? payload) as KubernetesPodsResult;
  },
};
