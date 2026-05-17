// src/hooks/useAuthMutation.ts
import { useMutation } from '@tanstack/react-query';
import { apiService } from '@services/api.service';
import { TokenManager } from '@utils/tokenManager';
import { API_CONFIG } from '@utils/constants';
import { normalizeAuthResponse } from '@services/auth.adapter';
import type { LoginCredentials, AuthResponse, TwoFactorPendingResponse } from '@typings/auth.types';

export function useLoginMutation() {
	return useMutation({
		mutationFn: async (
			credentials: LoginCredentials
		): Promise<AuthResponse | TwoFactorPendingResponse> => {
			const response = await apiService.post<any>(
				API_CONFIG.ENDPOINTS.LOGIN,
				credentials
			);

			const backendData = response && response.data ? response.data : response;

			// Detectar respuesta 2FA antes de intentar normalizar
			if (backendData?.requiresTwoFactor === true) {
				return { requiresTwoFactor: true, tempToken: backendData.tempToken } as TwoFactorPendingResponse;
			}

			const normalized = normalizeAuthResponse(backendData);

			if (normalized.tokens) {
				TokenManager.setTokens(
					normalized.tokens.accessToken,
					normalized.tokens.refreshToken || normalized.tokens.accessToken
				);
			}

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
