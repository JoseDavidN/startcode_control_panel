import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';

export type InstallStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface InstallStep {
  id: string;
  /** Ya en castellano. */
  label: string;
  status: InstallStepStatus;
  detail?: string;
}

export type InstallMode = 'install' | 'uninstall';

export interface ServiceInstallResult {
  ok: boolean;
  mode: InstallMode;
  service: string;
  steps: InstallStep[];
  os: { name: string; packageManager: string | null } | null;
  version: string | null;
  /** Instalar: ya estaba y solo se aseguró que estuviera en marcha. Desinstalar: estaba instalado. */
  alreadyInstalled: boolean;
  /** VPN: enlace para vincular la cuenta, datos de la interfaz y una clave pública. */
  access?: { url: string | null; info: string[]; key: string | null };
  error?: { code: string; message: string; detail?: string };
}

/** Si ya está instalado: decide si el botón instala o desinstala. */
export interface ServiceInstallStatus {
  service: string;
  installed: boolean;
  /** En un grupo (Kubernetes): qué distribución está instalada. */
  variant: string | null;
  version: string | null;
  os: { name: string; packageManager: string | null };
  /** En un grupo: las opciones y si este sistema las admite (con el motivo si no). */
  options?: { id: string; label: string; supported: boolean; reason: string | null }[];
  /** Servicio suelto que este sistema no admite: el motivo. */
  unsupported?: string | null;
}

/* apt update + install puede tardar minutos; el backend corta a los 10 por comando. */
const INSTALL_TIMEOUT_MS = 15 * 60_000;

const unwrap = <T,>(response: unknown): T => {
  const payload = (response as { data?: unknown })?.data ?? response;
  return ((payload as { data?: unknown })?.data ?? payload) as T;
};
const base = (serverId: string) => `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/services`;

export const serviceInstallService = {
  /** Instala (`install`) o desinstala por completo (`uninstall`). */
  async run(serverId: string, mode: InstallMode, service: string, sudoPassword?: string): Promise<ServiceInstallResult> {
    return unwrap<ServiceInstallResult>(await apiService.post<ServiceInstallResult>(
      `${base(serverId)}/${mode}`,
      { service, ...(sudoPassword ? { sudoPassword } : {}) },
      { timeout: INSTALL_TIMEOUT_MS },
    ));
  },

  /** Sin privilegios: sistema, si ya está instalado y su versión. */
  async status(serverId: string, service: string): Promise<ServiceInstallStatus> {
    return unwrap<ServiceInstallStatus>(await apiService.post<ServiceInstallStatus>(
      `${base(serverId)}/install-status`, { service }, { timeout: 45_000 },
    ));
  },
};
