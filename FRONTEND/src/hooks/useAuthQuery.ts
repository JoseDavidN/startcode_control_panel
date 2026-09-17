// src/hooks/useAuthQuery.ts
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@services/api.service';
import { TokenManager } from '@utils/tokenManager';
import { API_CONFIG } from '@utils/constants';
import { normalizeUser } from '@services/auth.adapter';
import type { User } from '@typings/auth.types';

/**
 * Hook para obtener el perfil del usuario autenticado
 */
export function useCurrentUser() {
	return useQuery({
		queryKey: ['currentUser'],
		queryFn: async (): Promise<User | null> => {
			const token = TokenManager.getAccessToken();

			if (!token) {
				return null;
			}

			try {
				// El backend puede devolver objeto directo o envuelto { success, data } o { user }
				const response = await apiService.get<any>(
					API_CONFIG.ENDPOINTS.ME
				);

				const payload =
					response && response.data ? response.data : response;
				const rawUser = payload?.user ?? payload;

				if (!rawUser) {
					// Guardamos estado limpio y devolvemos null (no undefined)
					TokenManager.clearTokens();
					return null;
				}

				// Normalizar usuario
				const normalizedUser = normalizeUser(rawUser);

				// Guardar en localStorage para persistencia
				TokenManager.saveUserData(normalizedUser);

				return normalizedUser;
			} catch (error) {
				console.error('Error getting current user:', error);

				/* Caída de red o backend: se conserva el usuario cacheado. Si el
				   fallo fue un 401 irrecuperable, el interceptor ya limpió los
				   tokens y entonces no hay sesión que sostener. */
				const savedUser = TokenManager.getUserData() as User | null;
				if (savedUser && TokenManager.getAccessToken()) {
					return savedUser;
				}

				TokenManager.clearTokens();
				return null;
			}
		},
		enabled: !!TokenManager.getAccessToken(), // Solo ejecutar si hay token
		staleTime: 1000 * 60 * 5, // 5 minutos
		retry: false,
	});
}
