import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';

export type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable';

export interface ServiceActionResult {
  success: boolean;
  action: string;
  service: string;
  /** Estado leído del servidor justo después de la acción. */
  state: string;
  subState: string;
  pid: number | null;
  enabled: boolean;
  output: string;
  /** Motivo legible cuando `success` es false. */
  error?: string;
}

export interface KillProcessResult {
  success: boolean;
  pid: number;
  name: string;
  /** El proceso ya terminó; SIGTERM se puede ignorar o tardar. */
  exited: boolean;
  error?: string;
}

export interface ServiceLogsResult {
  service: string;
  lines: string;
}

/** El backend responde el objeto directo; axios lo envuelve en `data`. */
function unwrap<T>(response: unknown): T {
  const first = (response as { data?: unknown })?.data ?? response;
  const second = (first as { data?: unknown })?.data ?? first;
  return second as T;
}

class ServiceControlService {
  /**
   * `sudoPassword` solo hace falta cuando el backend responde `SUDO_REQUIRED`:
   * viaja en el cuerpo para ese comando y no se guarda en ninguna parte.
   */
  async executeAction(
    serverId: string,
    serviceName: string,
    action: ServiceAction,
    sudoPassword?: string,
  ): Promise<ServiceActionResult> {
    const response = await apiService.post<ServiceActionResult>(
      `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/services/${encodeURIComponent(serviceName)}/action`,
      sudoPassword ? { action, sudoPassword } : { action },
    );
    return unwrap<ServiceActionResult>(response);
  }

  /** Cierra un proceso con SIGTERM (no forzado, sin -9). */
  async killProcess(serverId: string, pid: number, sudoPassword?: string): Promise<KillProcessResult> {
    const response = await apiService.post<KillProcessResult>(
      `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/processes/${pid}/kill`,
      sudoPassword ? { sudoPassword } : {},
    );
    return unwrap<KillProcessResult>(response);
  }

  /** Últimas líneas de `journalctl -u <unidad>` del servidor. */
  async readLogs(
    serverId: string,
    serviceName: string,
    opts: { lines?: number; sudoPassword?: string } = {},
  ): Promise<ServiceLogsResult> {
    const response = await apiService.post<ServiceLogsResult>(
      `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/services/${encodeURIComponent(serviceName)}/logs`,
      opts,
      /* El journal de una unidad ruidosa tarda más que una acción normal. */
      { timeout: 45_000 },
    );
    return unwrap<ServiceLogsResult>(response);
  }

  /** Reemplaza la lista de servicios fijados del servidor. */
  async setPinned(serverId: string, services: string[]): Promise<string[]> {
    const response = await apiService.put<{ pinned: string[] }>(
      `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/services/pinned`,
      { services },
    );
    const body = unwrap<{ pinned?: string[] } | undefined>(response);
    return body?.pinned ?? services;
  }
}

export const serviceControlService = new ServiceControlService();
