// src/lib/hostKeyAlert.ts
import { HOST_KEY_MISMATCH, type HostKeyMismatch } from '@typings/hostKey.types';

/*
 * Aviso global de clave de host cambiada. Lo pueden disparar el cliente HTTP,
 * la terminal y el SFTP; lo escucha un único modal (`HostKeyMismatchModal`,
 * montado en AppLayout), así cualquier acción que abra SSH enseña el mismo aviso.
 */

type Listener = (mismatch: HostKeyMismatch) => void;
const listeners = new Set<Listener>();

const isKey = (value: unknown): boolean => {
	const v = value as { fingerprint?: unknown } | null;
	return typeof v?.fingerprint === 'string';
};

/** El detalle del cambio si `payload` es un error HOST_KEY_MISMATCH bien formado. */
export function extractHostKeyMismatch(payload: unknown): HostKeyMismatch | null {
	const p = payload as { code?: unknown; hostKey?: Partial<HostKeyMismatch> } | null;
	if (p?.code !== HOST_KEY_MISMATCH || !p.hostKey) return null;
	const k = p.hostKey;
	if (typeof k.serverId !== 'string' || !k.serverId || !isKey(k.expected) || !isKey(k.received)) return null;
	return k as HostKeyMismatch;
}

/** Avisa si `payload` es un HOST_KEY_MISMATCH. Devuelve si lo era. */
export function reportHostKeyMismatch(payload: unknown): boolean {
	const mismatch = extractHostKeyMismatch(payload);
	if (!mismatch) return false;
	listeners.forEach(cb => cb(mismatch));
	return true;
}

export function onHostKeyMismatch(cb: Listener): () => void {
	listeners.add(cb);
	return () => { listeners.delete(cb); };
}
