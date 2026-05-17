export const API_CONFIG = {
	BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1',
	TIMEOUT: 30000,
	ENDPOINTS: {
		LOGIN: '/auth/login',
		LOGOUT: '/auth/logout',
		REFRESH: '/auth/refresh',
		VALIDATE: '/auth/validate',
		ME: '/auth/me',
		SERVERS: '/servers',
		AGENT_DATA: '/agent-data',
		TWO_FACTOR_SETUP: '/auth/2fa/setup',
		TWO_FACTOR_ENABLE: '/auth/2fa/enable',
		TWO_FACTOR_DISABLE: '/auth/2fa/disable',
		TWO_FACTOR_VERIFY_LOGIN: '/auth/2fa/verify-login',
		UPDATE_PROFILE: '/auth/profile',
		CHANGE_PASSWORD: '/auth/change-password',
	},
};

export const STORAGE_KEYS = {
	ACCESS_TOKEN: 'access_token',
	REFRESH_TOKEN: 'refresh_token',
	USER_DATA: 'user_data',
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
	// Settings
	SETTINGS: '/settings',
	PROFILE: '/profile',
	// Errors
	NOT_FOUND: '/404',
	UNAUTHORIZED: '/403',
};
