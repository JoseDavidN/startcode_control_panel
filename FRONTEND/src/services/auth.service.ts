// src/services/auth.service.ts
import { apiService } from './api.service';
import { TokenManager } from '../utils/tokenManager';
import { API_CONFIG } from '../utils/constants';
import type { LoginCredentials, AuthResponse, User } from '../types/auth.types';

class AuthService {
	async login(credentials: LoginCredentials): Promise<AuthResponse> {
		try {
			const response = await apiService.post<AuthResponse>(
				API_CONFIG.ENDPOINTS.LOGIN,
				credentials
			);

			const { user, tokens } = response.data;

			// Guardar tokens
			TokenManager.setTokens(tokens?.accessToken || '', tokens?.refreshToken || '');

			// Guardar datos del usuario
			TokenManager.saveUserData(user);

			return response.data;
		} catch (error: any) {
			throw new Error(
				error.response?.data?.message || 'Error al iniciar sesión'
			);
		}
	}

	async logout(): Promise<void> {
		try {
			await apiService.post(API_CONFIG.ENDPOINTS.LOGOUT);
		} catch (error) {
			console.error('Error al cerrar sesión:', error);
		} finally {
			TokenManager.clearTokens();
		}
	}

	async validateToken(): Promise<User | null> {
		try {
			const token = TokenManager.getAccessToken();

			if (!token) {
				return null;
			}

			// Verificar si el token está expirado
			if (TokenManager.isTokenExpired(token)) {
				// Intentar refrescar el token
				const refreshToken = TokenManager.getRefreshToken();
				if (refreshToken) {
					const response = await apiService.post<AuthResponse>(
						API_CONFIG.ENDPOINTS.REFRESH,
						{ refreshToken }
					);

					const { user, tokens } = response.data;
					TokenManager.setTokens(
						tokens?.accessToken || '',
						tokens?.refreshToken || ''
					);
					TokenManager.saveUserData(user);

					return user;
				}

				return null;
			}

			// Validar token con el backend
			const response = await apiService.get<{ user: User }>(
				API_CONFIG.ENDPOINTS.VALIDATE
			);

			TokenManager.saveUserData(response.data.user);
			return response.data.user;
		} catch (error) {
			console.error('Error validating token:', error);
			TokenManager.clearTokens();
			return null;
		}
	}

	async getCurrentUser(): Promise<User> {
		try {
			const response = await apiService.get<{ user: User }>(
				API_CONFIG.ENDPOINTS.ME
			);

			TokenManager.saveUserData(response.data.user);
			return response.data.user;
		} catch (error: any) {
			throw new Error(
				error.response?.data?.message || 'Error al obtener usuario'
			);
		}
	}

	async refreshToken(): Promise<AuthResponse> {
		try {
			const refreshToken = TokenManager.getRefreshToken();

			if (!refreshToken) {
				throw new Error('No refresh token available');
			}

			const response = await apiService.post<AuthResponse>(
				API_CONFIG.ENDPOINTS.REFRESH,
				{ refreshToken }
			);

			const { user, tokens } = response.data;
			TokenManager.setTokens(tokens?.accessToken || '', tokens?.refreshToken || '');
			TokenManager.saveUserData(user);

			return response.data;
		} catch (error: any) {
			TokenManager.clearTokens();
			throw new Error(
				error.response?.data?.message || 'Error al refrescar token'
			);
		}
	}
}

export const authService = new AuthService();
