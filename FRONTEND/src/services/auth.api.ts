// src/services/auth.api.ts
import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import type { UserSession } from '@typings/auth.types';

function unwrap<T>(response: unknown): T {
	const first = (response as { data?: unknown })?.data ?? response;
	const second = (first as { data?: unknown })?.data ?? first;
	return second as T;
}

export const authApi = {
	/** Cambio de contraseña caducada: sin sesión, con el token temporal del login. */
	async changeExpiredPassword(
		tempToken: string,
		currentPassword: string,
		newPassword: string,
	): Promise<unknown> {
		const res = await apiService.post(API_CONFIG.ENDPOINTS.CHANGE_EXPIRED_PASSWORD, {
			tempToken,
			currentPassword,
			newPassword,
		});
		return unwrap(res);
	},

	async listSessions(): Promise<UserSession[]> {
		const res = await apiService.get<UserSession[]>(API_CONFIG.ENDPOINTS.SESSIONS);
		const data = unwrap<UserSession[]>(res);
		return Array.isArray(data) ? data : [];
	},

	async revokeSession(id: string): Promise<void> {
		await apiService.delete(`${API_CONFIG.ENDPOINTS.SESSIONS}/${id}`);
	},

	async revokeOtherSessions(): Promise<number> {
		const res = await apiService.delete<{ revoked: number }>(API_CONFIG.ENDPOINTS.SESSIONS);
		return unwrap<{ revoked: number }>(res)?.revoked ?? 0;
	},
};
