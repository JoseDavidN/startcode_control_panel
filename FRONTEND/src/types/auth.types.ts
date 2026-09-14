import type { UserPreferences } from './preferences.types';

export interface User {
	id: string;
	email: string;
	name: string;
	firstname?: string;
	lastname?: string;
	role: UserRole; // Backend usa role singular
	roles?: UserRole[]; // Backward compatibility
	permissions?: Permission[]; // Opcional, se calcula desde el rol
	isActive: boolean;
	avatar?: string;
	twoFactorEnabled?: boolean;
	/** Códigos de respaldo de 2FA sin usar. */
	backupCodesRemaining?: number;
	lastLogin?: Date | string | null;
	passwordChangedAt?: Date | string | null;
	createdAt?: Date;
	/** null = el usuario nunca guardó preferencias en el servidor */
	preferences?: UserPreferences | null;
}

// Roles del backend: admin, user, viewer
export const UserRole = {
	ADMIN: 'admin',
	USER: 'user',
	VIEWER: 'viewer',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Permission = {
	// Servidores
	VIEW_SERVERS: 'view_servers',
	CREATE_SERVERS: 'create_servers',
	EDIT_SERVERS: 'edit_servers',
	DELETE_SERVERS: 'delete_servers',

	// Servicios
	VIEW_SERVICES: 'view_services',
	CREATE_SERVICES: 'create_services',
	EDIT_SERVICES: 'edit_services',
	DELETE_SERVICES: 'delete_services',
	RESTART_SERVICES: 'restart_services',

	// Usuarios
	VIEW_USERS: 'view_users',
	CREATE_USERS: 'create_users',
	EDIT_USERS: 'edit_users',
	DELETE_USERS: 'delete_users',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export interface LoginCredentials {
	email: string;
	password: string;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken?: string; // Opcional por ahora
}

export interface AuthResponse {
	user: User;
	// El backend puede devolver `token` (único) o el frontend usar `tokens`
	token?: string; // Token único desde backend (compatibilidad)
	tokens?: AuthTokens; // Formato normalizado en frontend
	expiresIn?: string; // Token expiration info
}

export interface TwoFactorPendingResponse {
	requiresTwoFactor: true;
	tempToken: string;
}

/** La contraseña caducó: no hay sesión hasta cambiarla. */
export interface PasswordChangeRequiredResponse {
	requiresPasswordChange: true;
	tempToken: string;
}

export interface TwoFactorSetupResponse {
	secret: string;
	otpAuthUrl: string;
	qrCodeDataUrl: string;
}

/** Al activar el 2FA, los códigos de respaldo se ven una única vez. */
export interface TwoFactorEnabledResponse {
	message: string;
	backupCodes: string[];
}

/** Sesión abierta del usuario. Solo puede haber una a la vez. */
export interface UserSession {
	id: string;
	userAgent: string | null;
	ip: string | null;
	lastUsed: string;
	createdAt: string;
	current: boolean;
}

export interface AuthContextType {
	user: User | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	login: (
		credentials: LoginCredentials,
	) => Promise<TwoFactorPendingResponse | PasswordChangeRequiredResponse | void>;
	complete2FALogin: (
		tempToken: string,
		payload: { code?: string; backupCode?: string },
	) => Promise<PasswordChangeRequiredResponse | void>;
	completeExpiredPasswordChange: (
		tempToken: string,
		currentPassword: string,
		newPassword: string,
	) => Promise<void>;
	logout: () => Promise<void>;
	refreshAuth: () => Promise<void>;
	hasPermission: (permission: Permission) => boolean;
	hasRole: (role: UserRole) => boolean;
	hasAnyRole: (roles: UserRole[]) => boolean;
}
