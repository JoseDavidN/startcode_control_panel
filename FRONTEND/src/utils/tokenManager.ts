import { STORAGE_KEYS } from './constants';
import { storeGet, storeSet, storeClearKeys } from '@lib/tauriStore';

// Cache en memoria — permite lecturas síncronas desde el interceptor de Axios
// mientras la persistencia ocurre de forma asíncrona en el store/localStorage.
let _access: string | null = null;
let _refresh: string | null = null;
let _user: unknown = null;

function persist(key: string, value: unknown): void {
	storeSet(key, value).catch((e) =>
		console.error('[TokenManager] persist error:', e)
	);
}

export class TokenManager {
	// Llamar una vez al arrancar, antes de renderizar la app.
	static async init(): Promise<void> {
		_access = await storeGet<string>(STORAGE_KEYS.ACCESS_TOKEN);
		_refresh = await storeGet<string>(STORAGE_KEYS.REFRESH_TOKEN);
		_user = await storeGet<unknown>(STORAGE_KEYS.USER_DATA);
	}

	// ── Lecturas síncronas (usadas en el interceptor de Axios) ──

	static getAccessToken(): string | null {
		return _access;
	}

	static getRefreshToken(): string | null {
		return _refresh;
	}

	static getUserData(): unknown {
		return _user;
	}

	// ── Escrituras: actualiza cache inmediatamente y persiste en background ──

	static setTokens(accessToken: string, refreshToken: string): void {
		_access = accessToken;
		_refresh = refreshToken;
		persist(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
		persist(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
	}

	static setAccessToken(accessToken: string): void {
		_access = accessToken;
		persist(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
	}

	static setRefreshToken(refreshToken: string): void {
		_refresh = refreshToken;
		persist(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
	}

	static clearTokens(): void {
		_access = null;
		_refresh = null;
		_user = null;
		storeClearKeys([
			STORAGE_KEYS.ACCESS_TOKEN,
			STORAGE_KEYS.REFRESH_TOKEN,
			STORAGE_KEYS.USER_DATA,
		]).catch((e) => console.error('[TokenManager] clear error:', e));
	}

	static saveUserData(user: unknown): void {
		_user = user;
		persist(STORAGE_KEYS.USER_DATA, user);
	}

	/* No hay utilidades para juzgar la caducidad del token: el reloj del cliente
	   puede ir desfasado respecto al servidor y daba por caducada una sesión
	   recién emitida. La autoridad es el 401 del backend, que el interceptor de
	   api.service resuelve con el refresh. */
}
