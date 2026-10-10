import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { storeDel, storeGet, storeSet } from '@lib/tauriStore';
import { STORAGE_KEYS } from '@utils/constants';
import { CloudApiError, cloudApi, cloudErrorMessage, normalizeCloudUrl, onCloudSessionLost, setCloudConnection } from '@services/cloud.api';
import type { CloudConnection, CloudConnectionState } from '@typings/cloud.types';

/* ── Conexión con StartCode Cloud ─────────────────────────────────────
   Estado único para toda la app (la vista Cloud y su modal de
   configuración lo leen a la vez), fuera de React: se carga una vez del
   almacén del equipo (`lib/tauriStore`, el de la app en escritorio) y se
   valida contra la nube con `/auth/me`. */

let state: CloudConnectionState = { status: 'connecting', connection: null, version: null, error: null };
const listeners = new Set<() => void>();
let started = false;

function setState(next: Partial<CloudConnectionState>): void {
	state = { ...state, ...next };
	setCloudConnection(state.connection);
	listeners.forEach(l => l());
}

/** Comprueba la conexión guardada; sin respuesta de la nube se queda guardada para reintentar. */
async function validate(): Promise<void> {
	const { connection } = state;
	if (!connection) {
		setState({ status: 'disconnected', version: null, error: null });
		return;
	}
	setState({ status: 'connecting', error: null });
	try {
		const me = await cloudApi.me();
		setState({ status: 'connected', version: me.version, error: null });
	} catch (error) {
		/* La sesión ya no vale: se olvida. Si solo no hay respuesta, se conserva. */
		if (error instanceof CloudApiError && error.statusCode === 401) {
			await forget(error.message);
		} else {
			setState({ status: 'disconnected', version: null, error: cloudErrorMessage(error, 'No se pudo contactar con la nube.') });
		}
	}
}

async function forget(error: string | null = null): Promise<void> {
	await storeDel(STORAGE_KEYS.CLOUD_CONNECTION);
	setState({ status: 'disconnected', connection: null, version: null, error });
}

function start(): void {
	if (started) return;
	started = true;
	onCloudSessionLost(message => { void forget(message); });
	void (async () => {
		const saved = await storeGet<CloudConnection>(STORAGE_KEYS.CLOUD_CONNECTION);
		setState({ connection: saved?.url && saved.token ? saved : null });
		await validate();
	})();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Nombre del equipo con el que la nube registra la sesión. */
function deviceName(): string {
	const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || 'equipo';
	return `StartCode Panel · ${platform}`;
}

export function useCloudConnection() {
	useEffect(start, []);
	const current = useSyncExternalStore(subscribe, () => state);

	/** Primera conexión: comprueba que la URL sea una nube, inicia sesión y guarda el token. */
	const connect = useCallback(async (rawUrl: string, username: string, password: string): Promise<void> => {
		const url = normalizeCloudUrl(rawUrl);
		let version: string;
		try {
			version = (await cloudApi.health(url)).version;
		} catch (error) {
			if (error instanceof CloudApiError && error.code === 'NOT_A_CLOUD') throw error;
			throw new CloudApiError('No se encontró StartCode Cloud en esa URL.', 0, 'UNREACHABLE', 'Revisa la dirección, el puerto y que el servidor de la nube esté encendido.');
		}
		const session = await cloudApi.login(url, username.trim(), password, deviceName());
		const connection: CloudConnection = { url, token: session.token, username: session.username };
		await storeSet(STORAGE_KEYS.CLOUD_CONNECTION, connection, true);
		setState({ status: 'connected', connection, version, error: null });
	}, []);

	/** Cierra la sesión en la nube (si responde) y la olvida en el equipo. */
	const disconnect = useCallback(async (): Promise<void> => {
		const { connection } = state;
		if (connection) await cloudApi.logout(connection.url, connection.token).catch(() => undefined);
		await forget();
	}, []);

	const retry = useCallback(() => validate(), []);

	return { ...current, connect, disconnect, retry };
}
