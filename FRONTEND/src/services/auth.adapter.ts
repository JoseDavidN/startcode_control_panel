// src/services/auth.adapter.ts
// Adaptador para normalizar respuestas del backend a formato del frontend

import type { User, AuthResponse, Permission } from '../types/auth.types';

/**
 * Mapea roles a permisos predeterminados
 * Roles del backend: admin, user, viewer
 */
export function getPermissionsFromRole(role: string): Permission[] {
	const rolePermissions: Record<string, Permission[]> = {
		// Admin tiene todos los permisos
		admin: [
			'view_servers',
			'create_servers',
			'edit_servers',
			'delete_servers',
			'view_services',
			'create_services',
			'edit_services',
			'delete_services',
			'restart_services',
			'view_users',
			'create_users',
			'edit_users',
			'delete_users',
		],
		// User tiene permisos de gestión básica
		user: [
			'view_servers',
			'create_servers',
			'edit_servers',
			'view_services',
			'create_services',
			'edit_services',
			'restart_services',
		],
		// Viewer solo puede ver
		viewer: ['view_servers', 'view_services'],
	};
	return rolePermissions[role] || [];
}

/**
 * Normaliza la entidad User del backend al formato del frontend
 * Backend puede retornar:
 * - Formato ya normalizado: { id, email, name, role, isActive, createdAt }
 * - Entidad completa: { id, str_email, str_firstname, str_lastname, enu_role, bol_is_active, createdAt }
 */
export function normalizeUser(user: any): User {
	// Si ya tiene el formato correcto (del login)
	if (user.email && user.name && !user.str_email) {
		return {
			id: user.id,
			email: user.email,
			name: user.name,
			role: user.role,
			roles: user.roles || (user.role ? [user.role] : []),
			isActive: user.isActive,
			createdAt: user.createdAt,
			permissions: user.permissions || getPermissionsFromRole(user.role),
		};
	}

	// Si viene de la entidad completa (de /me endpoint)
	return {
		id: user.id,
		email: user.str_email || user.email,
		name:
			user.str_firstname && user.str_lastname
				? `${user.str_firstname} ${user.str_lastname}`
				: user.name,
		role: user.enu_role || user.role,
		roles:
			user.roles ||
			(user.enu_role ? [user.enu_role] : user.role ? [user.role] : []),
		isActive:
			user.bol_is_active !== undefined
				? user.bol_is_active
				: user.isActive,
		createdAt: user.createdAt,
		permissions:
			user.permissions ||
			getPermissionsFromRole(user.enu_role || user.role),
	};
}

/**
 * Normaliza la respuesta de autenticación del backend
 * Backend: { user, token, expiresIn }
 * Frontend: { user, tokens: { accessToken, refreshToken } }
 */
export function normalizeAuthResponse(response: any): AuthResponse {
	// Aceptar tanto respuesta directa { user, token } como envuelta { data: { ... } }
	const payload = response?.data ?? response;

	if (!payload || !payload.user) {
		throw new Error('Respuesta inválida del servidor en login');
	}

	const { user, token, tokens, expiresIn } = payload;

	// Normalizar usuario
	const normalizedUser = normalizeUser(user);

	// Normalizar tokens (aceptar token único o estructura tokens)
	const accessToken = tokens?.accessToken || token || '';
	const refreshToken = tokens?.refreshToken || token || accessToken;

	return {
		user: normalizedUser,
		expiresIn,
		token: token,
		tokens: {
			accessToken,
			refreshToken,
		},
	};
}
