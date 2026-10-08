// src/hooks/useAuthMutation.ts
import { useMutation } from '@tanstack/react-query';
import { apiService } from '@services/api.service';
import { TokenManager } from '@utils/tokenManager';
import { API_CONFIG } from '@utils/constants';
import { normalizeAuthResponse } from '@services/auth.adapter';
import { getTrustedDeviceToken } from '@lib/trustedDevice';
import type {
	LoginCredentials,
	AuthResponse,
	PasswordChangeRequiredResponse,
	TwoFactorPendingResponse,
} from '@typings/auth.types';

export function useLoginMutation() {
	return useMutation({
		mutationFn: async (
			credentials: LoginCredentials
		): Promise<
			AuthResponse | TwoFactorPendingResponse | PasswordChangeRequiredResponse
		> => {
			/* Dispositivo de confianza: si el 2FA se verificó aquí hace menos de
			   7 días, el backend no vuelve a pedir el código. */
			const trustedDeviceToken = await getTrustedDeviceToken(credentials.email);
			const response = await apiService.post<any>(
				API_CONFIG.ENDPOINTS.LOGIN,
				trustedDeviceToken ? { ...credentials, trustedDeviceToken } : credentials
			);

			const backendData = response && response.data ? response.data : response;

			/* Respuestas sin sesión: hay que devolverlas tal cual, porque
			   normalizeAuthResponse exige `user` y lanzaría "Respuesta inválida
			   del servidor en login". */
			if (backendData?.requiresTwoFactor === true) {
				return { requiresTwoFactor: true, tempToken: backendData.tempToken } as TwoFactorPendingResponse;
			}

			if (backendData?.requiresPasswordChange === true) {
				return {
					requiresPasswordChange: true,
					tempToken: backendData.tempToken,
				} as PasswordChangeRequiredResponse;
			}

			const normalized = normalizeAuthResponse(backendData);

			if (normalized.tokens) {
				TokenManager.setTokens(
					normalized.tokens.accessToken,
					normalized.tokens.refreshToken || normalized.tokens.accessToken,
					normalized.rememberMe
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
