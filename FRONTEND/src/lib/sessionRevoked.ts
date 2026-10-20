import type { Socket } from 'socket.io-client';

/* Aviso de sesión terminada por el backend (`auth:revoked`).

   Lo emite cualquier socket del panel (terminal, SFTP, tiempo real) justo antes
   de que el servidor lo corte: logout, «cerrar otras sesiones», cambio de
   contraseña, expiración o inactividad. Los sockets solo avisan aquí; quien
   cierra la sesión de la app (AuthProvider) y la terminal (TerminalDockProvider)
   se suscriben. Un corte de red normal no pasa por aquí: socket.io reconecta solo. */

export const AUTH_REVOKED_EVENT = 'auth:revoked';

export interface SessionRevokedPayload {
	/** logout | revoked | password | limit | expired | inactivity | user | reuse */
	reason?: string;
	message?: string;
}

type Listener = (payload: SessionRevokedPayload) => void;

const listeners = new Set<Listener>();

export function notifySessionRevoked(payload: SessionRevokedPayload = {}): void {
	listeners.forEach(listener => listener(payload));
}

export function onSessionRevoked(listener: Listener): () => void {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}

/** Engancha el aviso a un socket. Devuelve una marca: tras el aviso, el corte no se reintenta. */
export function watchSessionRevoked(socket: Socket): { readonly revoked: boolean } {
	const state = { revoked: false };
	socket.on(AUTH_REVOKED_EVENT, (payload: SessionRevokedPayload | undefined) => {
		state.revoked = true;
		notifySessionRevoked(payload ?? {});
	});
	return state;
}
