// src/services/server.service.ts
import { apiService } from './api.service';
import { API_CONFIG } from '../utils/constants';

interface CreateServerDto {
	name: string;
	host: string;
	port: number;
	username: string;
	privateKey: string;
	os: string;
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

	/**
	 * Actualizar quickstats de todos los servidores
	 * Ejecuta quickstats para todos los servidores del usuario
	 */
	async refreshAllServersStats(): Promise<any[]> {
		const response = await apiService.get<any[]>(
			`${API_CONFIG.ENDPOINTS.MONITORING}/servers/all/stats`
		);
		const payload =
			response && (response as any).data
				? (response as any).data
				: response;
		const list =
			payload && (payload as any).data ? (payload as any).data : payload;
		return Array.isArray(list) ? (list as any[]) : [];
	}
}

export const serverService = new ServerService();
