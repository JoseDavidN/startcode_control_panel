/**
 * Espejo de BACKEND/src/notifications/entities/notification.entity.ts y de
 * dto/notification-response.dto.ts. Mantener ambos lados sincronizados.
 */

export type NotificationType =
	| 'server_offline'
	| 'server_online'
	| 'cpu_high'
	| 'memory_high'
	| 'disk_high'
	| 'security'
	| 'system';

export type NotificationSeverity = 'info' | 'warning' | 'error';

export interface AppNotification {
	id: string;
	type: NotificationType;
	severity: NotificationSeverity;
	title: string;
	body: string;
	serverId: string | null;
	metadata: { serverName?: string; value?: number; threshold?: number } | null;
	read: boolean;
	readAt: string | null;
	createdAt: string;
}

export interface NotificationListResponse {
	items: AppNotification[];
	/** Filas que cumplen el filtro actual */
	total: number;
	/** No leídas del usuario, sin filtros */
	unread: number;
}

export interface NotificationQuery {
	type?: NotificationType;
	unread?: boolean;
	limit?: number;
	offset?: number;
}

/** Etiquetas de los filtros de la página. `null` = todas. */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
	server_offline: 'Servidor caído',
	server_online: 'Reconexión',
	cpu_high: 'CPU alta',
	memory_high: 'Memoria alta',
	disk_high: 'Disco alto',
	security: 'Seguridad',
	system: 'Sistema',
};
