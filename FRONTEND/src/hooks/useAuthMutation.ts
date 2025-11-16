// src/hooks/useAuthMutation.ts
import { useMutation } from '@tanstack/react-query';
import { apiService } from '../services/api.service';
import { TokenManager } from '../utils/tokenManager';
import { API_CONFIG } from '../utils/constants';
import { normalizeAuthResponse } from '../services/auth.adapter';
import type { LoginCredentials, AuthResponse } from '../types/auth.types';

/**
 * Hook para el login con TanStack Query
 */
export function useLoginMutation() {
	return useMutation({
		mutationFn: async (
			credentials: LoginCredentials
		): Promise<AuthResponse> => {
			// El backend puede devolver objeto directo o envuelto { success, data }
			const response = await apiService.post<any>(
				API_CONFIG.ENDPOINTS.LOGIN,
				credentials
			);

			// Extraer datos de forma segura
			const backendData =	response && response.data ? response.data : response;

			// Normalizar respuesta del backend
			const normalized = normalizeAuthResponse(backendData);

			// Guardar tokens
			if (normalized.tokens) {
				TokenManager.setTokens(
					normalized.tokens.accessToken,
					normalized.tokens.refreshToken ||
						normalized.tokens.accessToken
				);
			}

			// Guardar usuario
			TokenManager.saveUserData(normalized.user);
			return normalized;
		},
		onError: (error: any) => {
			console.error('Login error:', error);
			TokenManager.clearTokens();
		},
	});
}

/**
 * Hook para el logout
 */
export function useLogoutMutation() {
	return useMutation({
		mutationFn: async (): Promise<void> => {
			try {
				await apiService.post(API_CONFIG.ENDPOINTS.LOGOUT);
			} catch (error) {
				console.error('Error al cerrar sesión:', error);
			}
		},
		onSuccess: () => {
			TokenManager.clearTokens();
		},
		onError: () => {
			// Limpiar tokens incluso si falla la petición
			TokenManager.clearTokens();
		},
	});
}
