import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';

export interface DockerContainerStats {
  cpuPercent: number;
  memPercent: number;
  /** "120MiB / 1.94GiB" tal cual lo da docker. */
  memUsage: string;
  netIO: string;
  blockIO: string;
  pids: number;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  command: string;
  createdAt: string;
  runningFor: string;
  status: string;
  state: string;
  ports: string[];
  networks: string[];
  mounts: string[];
  composeProject: string | null;
  composeService: string | null;
  stats: DockerContainerStats | null;
}

export interface DockerContainersResult {
  containers: DockerContainer[];
  readAt: string;
}

class DockerService {
  /** `sudoPassword` solo tras un `SUDO_REQUIRED`; no se guarda en ninguna parte. */
  async listContainers(serverId: string, sudoPassword?: string): Promise<DockerContainersResult> {
    const response = await apiService.post<DockerContainersResult>(
      `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/docker/containers`,
      sudoPassword ? { sudoPassword } : {},
      /* `docker stats --no-stream` tarda un par de segundos por sí solo. */
      { timeout: 45_000 },
    );
    const payload = (response as any)?.data ?? response;
    return ((payload as any)?.data ?? payload) as DockerContainersResult;
  }
}

export const dockerService = new DockerService();
