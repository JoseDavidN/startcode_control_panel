const API_URL = String(import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, '');

export const API_CONFIG = {
	/* Sin barra final: los endpoints empiezan por `/` y quedaría `//auth`. */
	BASE_URL: API_URL,
	/* Origen de los sockets (métricas, terminal, SFTP): el del API sin `/api/v1`. */
	WS_URL: API_URL.replace(/\/api\/v1$/, ''),
	TIMEOUT: 30000,
	ENDPOINTS: {
		LOGIN: '/auth/login',
		LOGOUT: '/auth/logout',
		REFRESH: '/auth/refresh',
		VALIDATE: '/auth/validate',
		ME: '/auth/me',
		SERVERS: '/servers',
		AGENT_DATA: '/agent-data',
		SFTP: '/sftp',
		TWO_FACTOR_SETUP: '/auth/2fa/setup',
		TWO_FACTOR_ENABLE: '/auth/2fa/enable',
		TWO_FACTOR_DISABLE: '/auth/2fa/disable',
		TWO_FACTOR_VERIFY_LOGIN: '/auth/2fa/verify-login',
		TWO_FACTOR_BACKUP_CODES: '/auth/2fa/backup-codes/regenerate',
		CHANGE_EXPIRED_PASSWORD: '/auth/change-expired-password',
		SESSIONS: '/auth/sessions',
		UPDATE_PROFILE: '/auth/profile',
		CHANGE_PASSWORD: '/auth/change-password',
		PREFERENCES: '/auth/preferences',
		HEALTH: '/health',
		NOTIFICATIONS: '/notifications',
		DATABASES: '/databases',
		NOTIFICATIONS_UNREAD: '/notifications/unread-count',
	},
};

export const STORAGE_KEYS = {
	ACCESS_TOKEN: 'access_token',
	REFRESH_TOKEN: 'refresh_token',
	USER_DATA: 'user_data',
	REMEMBER_ME: 'remember_me',
};

export const ROUTES = {
	// Public
	LOGIN: '/login',
	// Protected
	DASHBOARD: '/dashboard',
	// Servers
	SERVERS: '/servers',
	SERVER_DETAIL: '/servers/:id',
	SERVER_CREATE: '/servers/create',
	SERVER_EDIT: '/servers/:id/edit',
	// Services
	SERVICES: '/services',
	SERVICE_DETAIL: '/services/:id',
	SERVICE_CREATE: '/services/create',
	SERVICE_EDIT: '/services/:id/edit',
	// Databases
	DATABASES: '/databases',
	DATABASE_DETAIL: '/databases/:id',
	// Notifications
	NOTIFICATIONS: '/notifications',
	// Settings
	SETTINGS: '/settings',
	PROFILE: '/profile',
	// Errors
	NOT_FOUND: '/404',
	UNAUTHORIZED: '/403',
};
