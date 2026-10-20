// src/lib/hostKeyAlert.ts
import { HOST_KEY_MISMATCH, HOST_KEY_UNVERIFIED, type HostKeyMismatch } from '@typings/hostKey.types';

/*
 * Aviso global de clave de host cambiada o sin confirmar. Lo pueden disparar el cliente HTTP,
 * la terminal y el SFTP; lo escucha un único modal (`HostKeyMismatchModal`,
 * montado en AppLayout), así cualquier acción que abra SSH enseña el mismo aviso.
 */

type Listener = (mismatch: HostKeyMismatch) => void;
const listeners = new Set<Listener>();

const isKey = (value: unknown): boolean => {
	const v = value as { fingerprint?: unknown } | null;
	return typeof v?.fingerprint === 'string';
};

/**
 * El detalle si `payload` es un HOST_KEY_MISMATCH (con las dos huellas) o un
 * HOST_KEY_UNVERIFIED (sin guardada: `expected` null) bien formado.
 */
export function extractHostKeyMismatch(payload: unknown): HostKeyMismatch | null {
	const p = payload as { code?: unknown; hostKey?: Partial<HostKeyMismatch> } | null;
	if ((p?.code !== HOST_KEY_MISMATCH && p?.code !== HOST_KEY_UNVERIFIED) || !p.hostKey) return null;
	const k = p.hostKey;
	if (typeof k.serverId !== 'string' || !k.serverId || !isKey(k.received)) return null;
	if (p.code === HOST_KEY_MISMATCH ? !isKey(k.expected) : k.expected != null) return null;
	return { ...k, expected: k.expected ?? null } as HostKeyMismatch;
}

/** Avisa si `payload` es un rechazo de clave de host. Devuelve si lo era. */
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
