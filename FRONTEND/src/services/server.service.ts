// src/services/server.service.ts
import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import type {
	AgentInstallResult,
	AgentInstallState,
	AgentState,
	AgentTokenRegenerateResult,
	AgentUninstallResult,
} from '@typings/agent.types';
import type { ResourceTag } from '@utils/tags';

/* Instalar baja 7 MB y arranca un servicio: los 30 s del cliente se quedan
   cortos y el usuario vería un timeout mientras el trabajo sigue en marcha. */
const AGENT_OPERATION_TIMEOUT = 180_000;

function unwrapAgent<T>(response: unknown): T {
	const first = (response as { data?: unknown })?.data ?? response;
	const second = (first as { data?: unknown })?.data ?? first;
	return second as T;
}

/* Igual que `unwrapAgent`, pero con la comprobación por veracidad (no `??`)
   que estos endpoints usaron siempre: un `data` vacío no se desenvuelve. */
function unwrapPayload(response: unknown): unknown {
	const pick = (value: unknown): unknown => {
		const inner = (value as { data?: unknown } | null | undefined)?.data;
		return value && inner ? inner : value;
	};
	return pick(pick(response));
}

export interface CreateServerDto {
	name: string;
	host: string;
	port: number;
	username: string;
	privateKey: string;
	os: string;
	tag?: ResourceTag | null;
	description?: string;
}

/** Campos que admite PATCH /servers/:id (el backend rechaza cualquier otro). */
export interface UpdateServerDto {
	name?: string;
	host?: string;
	port?: number;
	username?: string;
	os?: string;
	/** null quita la etiqueta. */
	tag?: ResourceTag | null;
	description?: string;
}

export interface AcceptHostKeyResult {
	serverId: string;
	previous: { algorithm: string | null; fingerprint: string | null };
	hostKeyAlgorithm: string;
	hostKeyFingerprint: string;
	hostKeyVerifiedAt: string;
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
	/** Una sola etiqueta, opcional. */
	tag: ResourceTag | null;
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
	/** Cuándo se marcó como favorito (hasta 3 por usuario); null si no lo es. */
	favoritedAt?: string | null;
	/** Última vez que el agente reportó; null si nunca lo hizo */
	lastSeen?: string | null;
	hostname?: string | null;
	osVersion?: string | null;
	/** Clave de host SSH fijada en la primera conexión (TOFU); null hasta entonces. */
	hostKeyAlgorithm?: string | null;
	hostKeyFingerprint?: string | null;
	hostKeyVerifiedAt?: string | null;
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
		const created = unwrapPayload(response);
		return created as Server;
	}

	async getServers(): Promise<Server[]> {
		const response = await apiService.get<Server[]>(
			API_CONFIG.ENDPOINTS.SERVERS
		);
		const list = unwrapPayload(response);
		return Array.isArray(list) ? (list as Server[]) : [];
	}

	async getServer(id: string): Promise<Server> {
		const response = await apiService.get<Server>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}`
		);
		const item = unwrapPayload(response);
		return item as Server;
	}

	/** Cambia la llave privada SSH. El backend la guarda cifrada y nunca la devuelve. */
	async updatePrivateKey(id: string, privateKey: string): Promise<void> {
		await apiService.put(`${API_CONFIG.ENDPOINTS.SERVERS}/${id}/private-key`, { privateKey });
	}

	/**
	 * Acepta la clave de host que presenta ahora el servidor. `fingerprint` es la
	 * que vio el usuario en el aviso: si el servidor presenta otra, responde 409
	 * y no cambia nada.
	 */
	async acceptHostKey(id: string, fingerprint: string): Promise<AcceptHostKeyResult> {
		const response = await apiService.post<AcceptHostKeyResult>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}/host-key/accept`,
			{ fingerprint },
		);
		return unwrapPayload(response) as AcceptHostKeyResult;
	}

	/** Marca o quita un favorito. Con 3 ya marcados, marcar otro responde 409. */
	async setFavorite(id: string, favorite: boolean): Promise<void> {
		await apiService.put(`${API_CONFIG.ENDPOINTS.SERVERS}/${id}/favorite`, { favorite });
	}

	/** Actualiza los datos editables del servidor (la llave tiene su propio endpoint). */
	async updateServer(id: string, data: UpdateServerDto): Promise<Server> {
		const response = await apiService.patch<Server>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}`,
			data
		);
		const updated = unwrapPayload(response);
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
		const res = unwrapPayload(response);
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

	/** Regenera el token del agente: lo rota si está conectado, si no lo revoca. */
	async regenerateAgentToken(id: string): Promise<AgentTokenRegenerateResult> {
		const response = await apiService.post<AgentTokenRegenerateResult>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}/agent/token`,
			{},
		);
		return unwrapAgent<AgentTokenRegenerateResult>(response);
	}

	async getAgentState(id: string): Promise<AgentState> {
		const response = await apiService.get<AgentState>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}/agent`,
		);
		return unwrapAgent<AgentState>(response);
	}
}

export const serverService = new ServerService();
