// src/services/server.service.ts
import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import type {
	AgentInstallResult,
	AgentInstallState,
	AgentState,
	AgentUninstallResult,
} from '@typings/agent.types';

/* Instalar baja 7 MB y arranca un servicio: los 30 s del cliente se quedan
   cortos y el usuario vería un timeout mientras el trabajo sigue en marcha. */
const AGENT_OPERATION_TIMEOUT = 180_000;

function unwrapAgent<T>(response: unknown): T {
	const first = (response as { data?: unknown })?.data ?? response;
	const second = (first as { data?: unknown })?.data ?? first;
	return second as T;
}

interface CreateServerDto {
	name: string;
	host: string;
	port: number;
	username: string;
	privateKey: string;
	os: string;
	description?: string;
}

/** Campos que admite PATCH /servers/:id (el backend rechaza cualquier otro). */
export interface UpdateServerDto {
	name?: string;
	host?: string;
	port?: number;
	username?: string;
	os?: string;
	description?: string;
}

// Interfaz que coincide con ServerResponseDto del backend
export interface Server {
	id: string;
	name: string;
	host: string;
	port: number;
	username: string;
	/* Los siete valores del enum del backend: faltaban `warning` y `pending`,
	   y un servidor recién creado nace en `pending`. */
	status: 'online' | 'offline' | 'error' | 'maintenance' | 'checking' | 'warning' | 'pending';
	os: string;
	description?: string;
	metadata?: {
		osVersion?: string;
		activeServices?: number;
		agent?: {
			state: AgentInstallState;
			version?: string;
			arch?: 'amd64' | 'arm64';
			installedAt?: string;
			lastError?: { code: string; message: string; detail?: string; at: string };
		};
	};
	ownerId: string;
	/** Última vez que el agente reportó; null si nunca lo hizo */
	lastSeen?: string | null;
	hostname?: string | null;
	osVersion?: string | null;
	createdAt: string;
	updatedAt: string;
	lastCheckAt: string;
}

class ServerService {
	async createServer(data: CreateServerDto): Promise<Server> {
		const response = await apiService.post<Server>(
			API_CONFIG.ENDPOINTS.SERVERS,
			data
		);
		const payload =
			response && (response as any).data
				? (response as any).data
				: response;
		const created =
			payload && (payload as any).data ? (payload as any).data : payload;
		return created as Server;
	}

	async getServers(): Promise<Server[]> {
		const response = await apiService.get<Server[]>(
			API_CONFIG.ENDPOINTS.SERVERS
		);
		const payload =
			response && (response as any).data
				? (response as any).data
				: response;
		const list =
			payload && (payload as any).data ? (payload as any).data : payload;
		return Array.isArray(list) ? (list as Server[]) : [];
	}

	async getServer(id: string): Promise<Server> {
		const response = await apiService.get<Server>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}`
		);
		const payload =
			response && (response as any).data
				? (response as any).data
				: response;
		const item =
			payload && (payload as any).data ? (payload as any).data : payload;
		return item as Server;
	}

	/** Actualiza los datos editables del servidor (la llave tiene su propio endpoint). */
	async updateServer(id: string, data: UpdateServerDto): Promise<Server> {
		const response = await apiService.patch<Server>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}`,
			data
		);
		const payload =
			response && (response as any).data
				? (response as any).data
				: response;
		const updated =
			payload && (payload as any).data ? (payload as any).data : payload;
		return updated as Server;
	}

	async deleteServer(
		id: string,
		opts?: { force?: boolean; sudoPassword?: string },
	): Promise<{ message: string; warning?: string }> {
		/* El borrado desinstala antes el agente, así que puede tardar y puede
		   devolver 409 si no se pudo. */
		const response = await apiService.delete<{ message: string; warning?: string }>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}`,
			{ data: opts ?? {}, timeout: AGENT_OPERATION_TIMEOUT },
		);
		const payload =
			response && (response as any).data
				? (response as any).data
				: response;
		const res =
			payload && (payload as any).data ? (payload as any).data : payload;
		return res as { message: string; warning?: string };
	}

	/* ── Agente ───────────────────────────────────────────────────── */

	/** Instala el agente en la máquina remota. Devuelve el resultado del intento,
	 *  también cuando falla: los pasos son lo que pinta la interfaz. */
	async installAgent(
		id: string,
		body: { sudoPassword?: string; panelUrl?: string; reinstall?: boolean } = {},
	): Promise<AgentInstallResult> {
		const response = await apiService.post<AgentInstallResult>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}/agent/install`,
			body,
			{ timeout: AGENT_OPERATION_TIMEOUT },
		);
		return unwrapAgent<AgentInstallResult>(response);
	}

	async uninstallAgent(
		id: string,
		body: { sudoPassword?: string; purge?: boolean } = {},
	): Promise<AgentUninstallResult> {
		const response = await apiService.delete<AgentUninstallResult>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}/agent`,
			{ data: body, timeout: AGENT_OPERATION_TIMEOUT },
		);
		return unwrapAgent<AgentUninstallResult>(response);
	}

	async getAgentState(id: string): Promise<AgentState> {
		const response = await apiService.get<AgentState>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}/agent`,
		);
		return unwrapAgent<AgentState>(response);
	}
}

export const serverService = new ServerService();
