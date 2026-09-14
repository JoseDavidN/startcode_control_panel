// src/services/notifications.api.ts
import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import type {
	NotificationListResponse,
	NotificationQuery,
} from '@typings/notification.types';

/** El backend responde el objeto directo; axios lo envuelve en `data`. */
function unwrap<T>(response: unknown): T {
	const first = (response as { data?: unknown })?.data ?? response;
	const second = (first as { data?: unknown })?.data ?? first;
	return second as T;
}

const BASE = API_CONFIG.ENDPOINTS.NOTIFICATIONS;

export const notificationsApi = {
	async list(query: NotificationQuery = {}): Promise<NotificationListResponse> {
		const params = new URLSearchParams();
		if (query.type) params.set('type', query.type);
		if (query.unread) params.set('unread', 'true');
		params.set('limit', String(query.limit ?? 50));
		params.set('offset', String(query.offset ?? 0));

		const res = await apiService.get<NotificationListResponse>(
			`${BASE}?${params.toString()}`
		);
		const data = unwrap<NotificationListResponse>(res);
		return {
			items: Array.isArray(data?.items) ? data.items : [],
			total: data?.total ?? 0,
			unread: data?.unread ?? 0,
		};
	},

	async unreadCount(): Promise<number> {
		const res = await apiService.get<{ unread: number }>(
			API_CONFIG.ENDPOINTS.NOTIFICATIONS_UNREAD
		);
		return unwrap<{ unread: number }>(res)?.unread ?? 0;
	},

	async markRead(ids: string[]): Promise<number> {
		const res = await apiService.patch<{ updated: number }>(`${BASE}/read`, {
			ids,
		});
		return unwrap<{ updated: number }>(res)?.updated ?? 0;
	},

	async markAllRead(): Promise<number> {
		const res = await apiService.patch<{ updated: number }>(`${BASE}/read`, {
			all: true,
		});
		return unwrap<{ updated: number }>(res)?.updated ?? 0;
	},

	async remove(id: string): Promise<void> {
		await apiService.delete(`${BASE}/${id}`);
	},

	async clearAll(): Promise<number> {
		const res = await apiService.delete<{ deleted: number }>(BASE);
		return unwrap<{ deleted: number }>(res)?.deleted ?? 0;
	},
};
