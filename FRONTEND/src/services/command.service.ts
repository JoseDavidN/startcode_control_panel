import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';

export type CommandStatus = 'ok' | 'error' | 'timeout' | 'failed';

export interface CommandResult {
  id: string;
  command: string;
  cwd: string;
  /** Directorio al terminar: el siguiente comando parte de aquí. */
  nextCwd: string;
  output: string;
  exitCode: number | null;
  status: CommandStatus;
  durationMs: number;
  truncated: boolean;
  sudo: boolean;
}

export interface CommandHistoryEntry {
  id: string;
  command: string;
  cwd: string | null;
  sudo: boolean;
  status: CommandStatus;
  exitCode: number | null;
  durationMs: number;
  truncated: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface ExecCommandInput {
  command: string;
  cwd?: string;
  sudo?: boolean;
  /** Solo tras un `SUDO_REQUIRED`; no se guarda en ninguna parte. */
  sudoPassword?: string;
  /** Confirma un comando marcado como peligroso (`DANGEROUS_COMMAND`). */
  confirm?: boolean;
}

const unwrap = <T,>(response: unknown): T => {
  const payload = (response as any)?.data ?? response;
  return ((payload as any)?.data ?? payload) as T;
};

class CommandService {
  async exec(serverId: string, input: ExecCommandInput): Promise<CommandResult> {
    const response = await apiService.post<CommandResult>(
      `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/commands`,
      input,
      /* El comando puede tardar hasta 60 s en el servidor, más la conexión. */
      { timeout: 90_000 },
    );
    return unwrap<CommandResult>(response);
  }

  async history(serverId: string, limit = 50): Promise<CommandHistoryEntry[]> {
    const response = await apiService.get<CommandHistoryEntry[]>(
      `${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/commands?limit=${limit}`,
    );
    return unwrap<CommandHistoryEntry[]>(response);
  }
}

export const commandService = new CommandService();
