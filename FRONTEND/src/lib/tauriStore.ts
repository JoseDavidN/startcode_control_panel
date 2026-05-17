import { LazyStore } from '@tauri-apps/plugin-store';

export const IS_TAURI =
	typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Instancia única — LazyStore se inicializa en el primer acceso, no en la importación.
// autoSave por defecto: debounce de 100ms (suficiente para tokens).
const store = new LazyStore('app-data.json');

export async function storeGet<T>(key: string): Promise<T | null> {
	if (!IS_TAURI) {
		const raw = localStorage.getItem(key);
		if (raw === null) return null;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return raw as unknown as T;
		}
	}
	return (await store.get<T>(key)) ?? null;
}

export async function storeSet(key: string, value: unknown): Promise<void> {
	if (!IS_TAURI) {
		localStorage.setItem(key, JSON.stringify(value));
		return;
	}
	await store.set(key, value);
	await store.save();
}

export async function storeDel(key: string): Promise<void> {
	if (!IS_TAURI) {
		localStorage.removeItem(key);
		return;
	}
	await store.delete(key);
	await store.save();
}

export async function storeClearKeys(keys: string[]): Promise<void> {
	await Promise.all(keys.map(storeDel));
}
