// src/servers/types/agent-install.types.ts

/** Pasos de una instalación, en el orden en que ocurren. */
export type AgentInstallStepId =
  | 'ssh'
  | 'privileges'
  | 'systemd'
  | 'arch'
  | 'download'
  | 'checksum'
  | 'config'
  | 'service'
  | 'verify'
  | 'handshake'
  | 'files';

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface AgentInstallStep {
  id: AgentInstallStepId;
  /** En castellano y listo para pintar: la interfaz no traduce códigos. */
  label: string;
  status: AgentStepStatus;
  detail?: string;
}

export type AgentInstallErrorCode =
  | 'SSH_AUTH'
  | 'SSH_UNREACHABLE'
  | 'NO_SUDO'
  | 'SUDO_PASSWORD'
  | 'NO_SYSTEMD'
  | 'UNSUPPORTED_ARCH'
  | 'NO_DOWNLOADER'
  | 'DOWNLOAD_FAILED'
  | 'CHECKSUM'
  | 'DISK_FULL'
  | 'SERVICE_FAILED'
  | 'AGENT_NO_HANDSHAKE'
  | 'BINARY_MISSING'
  | 'PANEL_URL_MISSING'
  | 'UNKNOWN';

export interface AgentInstallError {
  code: AgentInstallErrorCode;
  message: string;
  detail?: string;
}

export interface AgentInstallResult {
  ok: boolean;
  serverId: string;
  status: string;
  version?: string;
  arch?: 'amd64' | 'arm64';
  steps: AgentInstallStep[];
  /** Presente cuando `ok` es false, o como aviso cuando la instalación acabó a medias. */
  error?: AgentInstallError;
  warning?: string;
}

export interface AgentUninstallResult {
  ok: boolean;
  /** false = no había nada que quitar, que no es lo mismo que un fallo. */
  removed: boolean;
  steps: AgentInstallStep[];
  error?: AgentInstallError;
}

/** Etiquetas de cada paso, en un solo sitio. */
export const STEP_LABELS: Record<AgentInstallStepId, string> = {
  ssh: 'Conexión SSH',
  privileges: 'Permisos de administrador',
  systemd: 'Comprobando systemd',
  arch: 'Arquitectura del servidor',
  download: 'Descargando el agente',
  checksum: 'Verificando la descarga',
  config: 'Escribiendo la configuración',
  service: 'Instalando el servicio',
  verify: 'Comprobando que arrancó',
  handshake: 'Conectando con el panel',
  files: 'Borrando archivos',
};
