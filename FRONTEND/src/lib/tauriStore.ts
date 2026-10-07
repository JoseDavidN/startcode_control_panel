import { LazyStore } from '@tauri-apps/plugin-store';

export const IS_TAURI =
	typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Instancia única — LazyStore se inicializa en el primer acceso, no en la importación.
// autoSave por defecto: debounce de 100ms (suficiente para tokens).
const store = new LazyStore('app-data.json');

// Valores de sesión no persistente en Tauri: solo viven mientras la app está abierta.
const memory = new Map<string, unknown>();

export async function storeGet<T>(key: string): Promise<T | null> {
	if (!IS_TAURI) {
		const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
		if (raw === null) return null;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return raw as unknown as T;
		}
	}
	if (memory.has(key)) return memory.get(key) as T;
	return (await store.get<T>(key)) ?? null;
}

/**
 * `persistent = false` guarda solo durante la sesión del navegador
 * (sessionStorage) o de la app (memoria en Tauri). Cada escritura borra la
 * copia del otro almacenamiento para que no quede un valor obsoleto.
 */
export async function storeSet(key: string, value: unknown, persistent = true): Promise<void> {
	if (!IS_TAURI) {
		const target = persistent ? localStorage : sessionStorage;
		const other = persistent ? sessionStorage : localStorage;
		target.setItem(key, JSON.stringify(value));
		other.removeItem(key);
		return;
	}
	if (persistent) {
		memory.delete(key);
		await store.set(key, value);
	} else {
		memory.set(key, value);
		await store.delete(key);
	}
	await store.save();
}

export async function storeDel(key: string): Promise<void> {
	if (!IS_TAURI) {
		localStorage.removeItem(key);
		sessionStorage.removeItem(key);
		return;
	}
	memory.delete(key);
	await store.delete(key);
	await store.save();
}

export async function storeClearKeys(keys: string[]): Promise<void> {
	await Promise.all(keys.map(storeDel));
}
