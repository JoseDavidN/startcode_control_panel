import { LazyStore } from '@tauri-apps/plugin-store';

// Instancia única — LazyStore se inicializa en el primer acceso, no en la importación.
// autoSave por defecto: debounce de 100ms (suficiente para tokens).
const store = new LazyStore('app-data.json');

// Valores de sesión no persistentes: solo viven mientras la app está abierta.
const memory = new Map<string, unknown>();

export async function storeGet<T>(key: string): Promise<T | null> {
	if (memory.has(key)) return memory.get(key) as T;
	return (await store.get<T>(key)) ?? null;
}

/**
 * `persistent = false` guarda solo mientras la app está abierta (memoria).
 * Cada escritura borra la copia del otro almacenamiento para que no quede un
 * valor obsoleto.
 */
export async function storeSet(key: string, value: unknown, persistent = true): Promise<void> {
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
	memory.delete(key);
	await store.delete(key);
	await store.save();
}

export async function storeClearKeys(keys: string[]): Promise<void> {
	await Promise.all(keys.map(storeDel));
}
