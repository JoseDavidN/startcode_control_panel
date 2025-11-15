import { STORAGE_KEYS } from './constants';

export class TokenManager {
	static setTokens(accessToken: string, refreshToken: string): void {
		localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
		localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
	}

	static setAccessToken(accessToken: string): void {
		localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
	}

	static setRefreshToken(refreshToken: string): void {
		localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
	}

	static getAccessToken(): string | null {
		return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
	}

	static getRefreshToken(): string | null {
		return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
	}

	static clearTokens(): void {
		localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
		localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
		localStorage.removeItem(STORAGE_KEYS.USER_DATA);
	}

	static isTokenExpired(token: string): boolean {
		try {
			const payload = JSON.parse(atob(token.split('.')[1]));
			const expirationTime = payload.exp * 1000; // Convertir a milisegundos
			const currentTime = Date.now();

			// Considerar expirado 5 minutos antes para renovar a tiempo
			return expirationTime - currentTime < 5 * 60 * 1000;
		} catch (error) {
			console.error('Error decoding token:', error);
			return true;
		}
	}

	static getTokenPayload(token: string): any {
		try {
			return JSON.parse(atob(token.split('.')[1]));
		} catch (error) {
			console.error('Error decoding token:', error);
			return null;
		}
	}

	static saveUserData(user: any): void {
		localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
	}

	static getUserData(): any {
		const data = localStorage.getItem(STORAGE_KEYS.USER_DATA);
		return data ? JSON.parse(data) : null;
	}
}
