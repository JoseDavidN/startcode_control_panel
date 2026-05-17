// src/services/api.service.ts
import axios, {
	type AxiosInstance,
	AxiosError,
	type InternalAxiosRequestConfig,
} from 'axios';
import { API_CONFIG } from '@utils/constants';
import { TokenManager } from '@utils/tokenManager';
import type { ApiError, ApiResponse } from '@typings/api.types';

class ApiService {
	private api: AxiosInstance;
	private isRefreshing = false;
	private failedQueue: Array<{
		resolve: (value?: any) => void;
		reject: (reason?: any) => void;
	}> = [];

	constructor() {
		this.api = axios.create({
			baseURL: API_CONFIG.BASE_URL,
			timeout: API_CONFIG.TIMEOUT,
			headers: {
				'Content-Type': 'application/json',
			},
		});

		this.setupInterceptors();
	}

	private setupInterceptors(): void {
		// Request interceptor
		this.api.interceptors.request.use(
			(config: InternalAxiosRequestConfig) => {
				const token = TokenManager.getAccessToken();

				if (token && config.headers) {
					config.headers.Authorization = `Bearer ${token}`;
				}

				return config;
			},
			(error) => {
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

				// Si el error es 401 y no es un retry
				if (error.response?.status === 401 && !originalRequest._retry) {
					if (this.isRefreshing) {
						// Si ya se está refrescando, poner en cola
						return new Promise((resolve, reject) => {
							this.failedQueue.push({ resolve, reject });
						})
							.then(() => {
								return this.api(originalRequest);
							})
							.catch((err) => {
								return Promise.reject(err);
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
						const response = await axios.post(
							`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.REFRESH}`,
							{
								refreshToken,
							}
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

						TokenManager.clearTokens();
						window.location.href = '/login';

						return Promise.reject(refreshError);
					} finally {
						this.isRefreshing = false;
					}
				}

				return Promise.reject(this.handleError(error));
			}
		);
	}

	private handleError(error: AxiosError): ApiError {
		if (error.response) {
			const data = error.response.data as any;
			return {
				message: data?.message || 'Error en la petición',
				statusCode: error.response.status,
				errors: data?.errors,
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
	async get<T>(url: string, config?: any): Promise<ApiResponse<T>> {
		const response = await this.api.get(url, config);
		return response.data;
	}

	async post<T>(
		url: string,
		data?: any,
		config?: any
	): Promise<ApiResponse<T>> {
		const response = await this.api.post(url, data, config);
		return response.data;
	}

	async put<T>(
		url: string,
		data?: any,
		config?: any
	): Promise<ApiResponse<T>> {
		const response = await this.api.put(url, data, config);
		return response.data;
	}

	async patch<T>(
		url: string,
		data?: any,
		config?: any
	): Promise<ApiResponse<T>> {
		const response = await this.api.patch(url, data, config);
		return response.data;
	}

	async delete<T>(url: string, config?: any): Promise<ApiResponse<T>> {
		const response = await this.api.delete(url, config);
		return response.data;
	}
}

export const apiService = new ApiService();
