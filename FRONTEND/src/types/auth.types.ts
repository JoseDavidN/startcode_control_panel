export interface User {
	id: string;
	email: string;
	name: string;
	role: UserRole; // Backend usa role singular
	roles?: UserRole[]; // Backward compatibility
	permissions?: Permission[]; // Opcional, se calcula desde el rol
	isActive: boolean;
	avatar?: string;
	createdAt?: Date;
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

export interface AuthContextType {
	user: User | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	login: (credentials: LoginCredentials) => Promise<void>;
	logout: () => Promise<void>;
	refreshAuth: () => Promise<void>;
	hasPermission: (permission: Permission) => boolean;
	hasRole: (role: UserRole) => boolean;
	hasAnyRole: (roles: UserRole[]) => boolean;
}
