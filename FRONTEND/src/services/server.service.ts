// src/services/server.service.ts
import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';

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
	status: 'online' | 'offline' | 'error' | 'maintenance' | 'checking';
	os: string;
	description?: string;
	metadata?: any;
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

	async deleteServer(id: string): Promise<{ message: string }> {
		const response = await apiService.delete<{ message: string }>(
			`${API_CONFIG.ENDPOINTS.SERVERS}/${id}`
		);
		const payload =
			response && (response as any).data
				? (response as any).data
				: response;
		const res =
			payload && (payload as any).data ? (payload as any).data : payload;
		return res as { message: string };
	}

	async refreshAllServersStats(): Promise<Server[]> {
		return this.getServers();
	}
}

export const serverService = new ServerService();
