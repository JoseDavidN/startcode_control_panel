// src/services/auth.adapter.ts
// Adaptador para normalizar respuestas del backend a formato del frontend

import type { User, AuthResponse, Permission } from '@typings/auth.types';

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
	// Determinar firstname/lastname
	const firstname: string | undefined =
		user.firstname ?? user.str_firstname;
	const lastname: string | undefined =
		user.lastname ?? user.str_lastname;

	// Construir el nombre completo
	const name: string =
		user.name ||
		(firstname && lastname ? `${firstname} ${lastname}` : firstname || lastname || '');

	const role = user.enu_role || user.role;
	const email = user.str_email || user.email;
	const isActive = user.bol_is_active !== undefined ? user.bol_is_active : user.isActive;

	return {
		id: user.id,
		email,
		name,
		firstname,
		lastname,
		role,
		roles: user.roles || (role ? [role] : []),
		isActive,
		twoFactorEnabled: user.twoFactorEnabled ?? user.bol_two_factor_enabled ?? false,
		lastLogin: user.lastLogin ?? null,
		passwordChangedAt: user.passwordChangedAt ?? null,
		createdAt: user.createdAt,
		preferences: user.preferences ?? null,
		permissions: user.permissions || getPermissionsFromRole(role),
	};
}

/**
 * Normaliza la respuesta de autenticación del backend
 * Backend: { user, token, refreshToken, expiresIn }
 * Frontend: { user, tokens: { accessToken, refreshToken } }
 */
export function normalizeAuthResponse(response: any): AuthResponse {
	// Aceptar tanto respuesta directa { user, token } como envuelta { data: { ... } }
	const payload = response?.data ?? response;

	if (!payload || !payload.user) {
		throw new Error('Respuesta inválida del servidor en login');
	}

	const { user, token, refreshToken, tokens, expiresIn } = payload;

	// Normalizar usuario
	const normalizedUser = normalizeUser(user);

	// Normalizar tokens (aceptar token único o estructura tokens)
	// Priorizar: tokens.accessToken > token > ''
	// Priorizar refresh: tokens.refreshToken > refreshToken > ''
	const accessToken = tokens?.accessToken || token || '';
	const refresh = tokens?.refreshToken || refreshToken || '';

	return {
		user: normalizedUser,
		expiresIn,
		token: token,
		tokens: {
			accessToken,
			refreshToken: refresh,
		},
	};
}
