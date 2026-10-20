// src/services/api.service.ts
import axios, {
	type AxiosInstance,
	AxiosError,
	type AxiosRequestConfig,
	type InternalAxiosRequestConfig,
} from 'axios';
import { invoke } from '@tauri-apps/api/core';
import { API_CONFIG } from '@utils/constants';
import { TokenManager } from '@utils/tokenManager';
import { queryClient } from '@lib/queryClient';
import type { ApiError, ApiResponse } from '@typings/api.types';
import { reportHostKeyMismatch } from '@lib/hostKeyAlert';
import { notifySessionRevoked } from '@lib/sessionRevoked';

/* La app usa el webview del sistema, cuyo user-agent no la distingue de un
   navegador (en Windows hasta dice «Edg/»). Se identifica con esta cabecera y
   el backend la añade al user-agent de la sesión. */
const CLIENT_HEADERS: Record<string, string> = {
	'X-StartCode-Client': `desktop/${import.meta.env.VITE_APP_VERSION ?? '0.0.0'}`,
};

/* Nombre del equipo (comando `device_name` de Tauri). Solo viaja en las
   peticiones de inicio de sesión: alimenta el aviso de seguridad «Nuevo
   inicio de sesión» que reciben los demás equipos del usuario. Codificado
   porque una cabecera no admite tildes («MacBook de Andrés»). */
let deviceName: string | null = null;
void invoke<string | null>('device_name')
	.then((name) => { deviceName = name; })
	.catch(() => undefined);

/** Endpoints cuyo 401 hay que devolver tal cual a quien llamó. */
const AUTH_ENDPOINTS = [
	'/auth/login',
	'/auth/register',
	'/auth/refresh',
	'/auth/2fa/verify-login',
	'/auth/change-expired-password',
];

function isAuthEndpoint(url?: string): boolean {
	if (!url) return false;
	return AUTH_ENDPOINTS.some((path) => url.includes(path));
}

class ApiService {
	private api: AxiosInstance;
	private isRefreshing = false;
	private failedQueue: Array<{
		resolve: (value?: unknown) => void;
		reject: (reason?: unknown) => void;
	}> = [];

	constructor() {
		this.api = axios.create({
			baseURL: API_CONFIG.BASE_URL,
			timeout: API_CONFIG.TIMEOUT,
			headers: {
				'Content-Type': 'application/json',
				...CLIENT_HEADERS,
			},
		});

		this.setupInterceptors();
	}

	private setupInterceptors(): void {
		// Request interceptor
		this.api.interceptors.request.use(
			(config: InternalAxiosRequestConfig) => {
				const token = TokenManager.getAccessToken();

				if (deviceName && config.headers && isAuthEndpoint(config.url)) {
					config.headers['X-StartCode-Device'] = encodeURIComponent(deviceName);
				}

				if (token && config.headers) {
					config.headers.Authorization = `Bearer ${token}`;
				}

				return config;
			},
			(error: Error) => {
				return Promise.reject(error);
			}
		);

		// Response interceptor
		this.api.interceptors.response.use(
			(response) => response,
			async (error: AxiosError) => {
				const originalRequest =
					error.config as InternalAxiosRequestConfig & {
						_retry?: boolean;
					};

				/* Un 401 de los endpoints de autenticación es una respuesta de
				   negocio —credenciales incorrectas, cuenta bloqueada, código 2FA
				   inválido—, no una sesión caducada. Al intentar refrescar aquí se
				   borraban los tokens y el usuario veía "No refresh token
				   available" en lugar del mensaje real del servidor; ahora cae
				   directo al reject del final, que conserva ese mensaje. */
				const isBusinessAuthError = isAuthEndpoint(originalRequest?.url);

				// Si el error es 401 y no es un retry
				if (
					error.response?.status === 401 &&
					!originalRequest._retry &&
					!isBusinessAuthError
				) {
					if (this.isRefreshing) {
						// Si ya se está refrescando, poner en cola
						return new Promise((resolve, reject) => {
							this.failedQueue.push({ resolve, reject });
						})
							.then(() => {
								return this.api(originalRequest);
							});
					}

					originalRequest._retry = true;
					this.isRefreshing = true;

					try {
						const refreshToken = TokenManager.getRefreshToken();

						if (!refreshToken) {
							throw new Error('No refresh token available');
						}

						// Intentar refrescar el token
						const response = await axios.post<{ token: string; refreshToken: string }>(
							`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.REFRESH}`,
							{
								refreshToken,
							},
							{ headers: CLIENT_HEADERS }
						);

						// El backend devuelve { user, token, refreshToken, expiresIn }
						const { token, refreshToken: newRefreshToken } = response.data;

						// Guardar los nuevos tokens
						TokenManager.setTokens(token, newRefreshToken);

						// Procesar la cola de peticiones fallidas
						this.failedQueue.forEach((promise) => {
							promise.resolve();
						});
						this.failedQueue = [];

						// Reintentar la petición original
						return this.api(originalRequest);
					} catch (refreshError) {
						// Si falla el refresh, limpiar todo y redirigir al login
						this.failedQueue.forEach((promise) => {
							promise.reject(refreshError);
						});
						this.failedQueue = [];

						/* El backend cerró la sesión por reutilizar un refresh ya rotado:
						   AuthProvider limpia y lleva al login con el motivo, sin recargar. */
						const failure = axios.isAxiosError<{ code?: string; message?: string }>(refreshError)
							? refreshError.response?.data
							: undefined;
						if (failure?.code === 'REFRESH_REUSED') {
							notifySessionRevoked({ reason: 'reuse', message: failure.message });
							return Promise.reject(refreshError as Error);
						}

						TokenManager.clearTokens();
						queryClient.clear();
						/* Si ya estamos en el login, no recargamos: una petición
						   sin sesión desde esa pantalla dejaría la app en bucle
						   de recargas. */
						if (!window.location.pathname.startsWith('/login')) {
							window.location.href = '/login';
						}

						/* axios solo rechaza con AxiosError, y lo demás es el Error de
						   «No refresh token available». */
						return Promise.reject(refreshError as Error);
					} finally {
						this.isRefreshing = false;
					}
				}

				/* El contrato de toda la app es rechazar con el `ApiError` plano
				   (statusCode, code, hint): los consumidores lo leen así y algunos
				   distinguen `instanceof Error` para otros fallos. */
				// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- ver comentario
				return Promise.reject(this.handleError(error));
			}
		);
	}

	private handleError(error: AxiosError): ApiError {
		if (error.response) {
			const data = error.response.data as Partial<ApiError> | undefined;
			/* Clave de host SSH cambiada: sea cual sea la acción, el modal global
			   enseña el aviso con las dos huellas. */
			reportHostKeyMismatch(data);
			return {
				message: data?.message || 'Error en la petición',
				statusCode: error.response.status,
				errors: data?.errors,
				code: data?.code,
				hint: data?.hint,
				hostKey: data?.hostKey,
			};
		} else if (error.request) {
			return {
				message: 'No se recibió respuesta del servidor',
				statusCode: 0,
			};
		} else {
			return {
				message: error.message || 'Error desconocido',
				statusCode: 0,
			};
		}
	}

	// Métodos HTTP
	async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
		const response = await this.api.get<ApiResponse<T>>(url, config);
		return response.data;
	}

	async post<T>(
		url: string,
		data?: unknown,
		config?: AxiosRequestConfig
	): Promise<ApiResponse<T>> {
		const response = await this.api.post<ApiResponse<T>>(url, data, config);
		return response.data;
	}

	async put<T>(
		url: string,
		data?: unknown,
		config?: AxiosRequestConfig
	): Promise<ApiResponse<T>> {
		const response = await this.api.put<ApiResponse<T>>(url, data, config);
		return response.data;
	}

	async patch<T>(
		url: string,
		data?: unknown,
		config?: AxiosRequestConfig
	): Promise<ApiResponse<T>> {
		const response = await this.api.patch<ApiResponse<T>>(url, data, config);
		return response.data;
	}

	async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
		const response = await this.api.delete<ApiResponse<T>>(url, config);
		return response.data;
	}
}

export const apiService = new ApiService();
