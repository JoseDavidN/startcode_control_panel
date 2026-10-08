import { storeGet, storeSet } from '@lib/tauriStore';

/**
 * Tokens de dispositivo de confianza del 2FA, uno por cuenta (email) en el
 * store local de Tauri. Los firma el backend tras un código correcto y valen
 * 7 días; aquí solo se guardan y se reenvían en el login. No se borran al
 * cerrar sesión: recordar el dispositivo es justo eso. Si el backend lo
 * rechaza (caducado, otra contraseña, 2FA reactivado), vuelve a pedir el
 * código y el token nuevo sustituye al viejo.
 */
const KEY = 'startcode:2fa-trusted';

type TrustMap = Record<string, string>;

const norm = (email: string) => email.trim().toLowerCase();

async function readAll(): Promise<TrustMap> {
	try {
		return (await storeGet<TrustMap>(KEY)) ?? {};
	} catch {
		return {};
	}
}

export async function getTrustedDeviceToken(email: string): Promise<string | undefined> {
	return (await readAll())[norm(email)];
}

export async function saveTrustedDeviceToken(email: string, token: string): Promise<void> {
	const all = await readAll();
	all[norm(email)] = token;
	try {
		await storeSet(KEY, all);
	} catch {
		/* Sin almacenamiento el 2FA se pedirá en el próximo login, nada más. */
	}
}
