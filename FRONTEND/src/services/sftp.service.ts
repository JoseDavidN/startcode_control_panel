import { Channel, invoke } from '@tauri-apps/api/core';
import { io, type Socket } from 'socket.io-client';
import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import { TokenManager } from '@utils/tokenManager';
import { watchSessionRevoked } from '@lib/sessionRevoked';
import { reportHostKeyMismatch } from '@lib/hostKeyAlert';
import type { SftpEntry, SftpListing, SftpReady } from '@typings/sftp.types';

/** Respuesta de un ack del gateway: nunca lanza al socket, siempre responde. */
type Ack<T> = ({ ok: true } & T) | { ok: false; message: string };

/** Ningún ack debería tardar esto: si tarda, algo se quedó colgado. */
const ACK_TIMEOUT_MS = 20_000;
/** Crear el árbol de una carpeta grande son miles de mkdir en el servidor. */
const MKDIRP_TIMEOUT_MS = 120_000;

export interface SftpConnection {
	readonly sessionId: string;
	readonly home: string;
	readonly serverName: string;
	readonly user: string;
	readonly host: string;
	list(path?: string): Promise<SftpListing>;
	mkdir(path: string, name: string): Promise<string>;
	mkdirp(base: string, dirs: string[]): Promise<number>;
	realpath(path: string): Promise<string>;
	/** Borra el archivo a medias de una subida por partes que no terminó. */
	discard(destDir: string, relPath: string): Promise<void>;
	/** El socket se cortó; socket.io reintenta solo. */
	onClosed(cb: (reason: string) => void): () => void;
	/** Volvió. Si el backend ya no tenía la sesión, `sessionId` es otra. */
	onReconnected(cb: (info: SftpReady) => void): () => void;
	close(): void;
}

const socketBase = () => API_CONFIG.WS_URL;

/**
 * Abre la sesión SFTP. Vive mientras el modal esté abierto: al cerrar el
 * socket, el backend suelta la conexión SSH.
 */
export function openSftpConnection(serverId: string): Promise<SftpConnection> {
	return new Promise((resolve, reject) => {
		/* Al reconectar se pide la misma sesión (`resume`): el backend la guarda
		   un minuto tras un corte, y las subidas en curso siguen con ella. El
		   token se lee en cada intento: puede haberse renovado. */
		let sessionId: string | null = null;
		let resolved = false;
		const socket: Socket = io(`${socketBase()}/sftp`, {
			transports: ['websocket'],
			auth: cb => cb({ token: TokenManager.getAccessToken(), serverId, resume: sessionId ?? undefined }),
		});

		const closedHandlers = new Set<(reason: string) => void>();
		const reconnectedHandlers = new Set<(info: SftpReady) => void>();
		watchSessionRevoked(socket);

		const emit = <T,>(event: string, payload: unknown, timeoutMs = ACK_TIMEOUT_MS): Promise<T> =>
			new Promise<T>((ok, fail) => {
				const timer = setTimeout(
					() => fail(new Error('El servidor no respondió a tiempo')),
					timeoutMs,
				);

				socket.emit(event, payload, (ack: Ack<T>) => {
					clearTimeout(timer);
					if (!ack) return fail(new Error('Respuesta vacía del servidor'));
					if (!ack.ok) return fail(new Error(ack.message));
					ok(ack as T);
				});
			});

		socket.on('sftp:error', (payload: { message?: string; code?: string }) => {
			/* Clave de host cambiada: el modal global enseña las dos huellas. */
			reportHostKeyMismatch(payload);
			const message = payload?.message ?? 'No se pudo abrir la sesión SFTP';
			if (!resolved) reject(new Error(message));
			else closedHandlers.forEach(cb => cb(message));
		});

		socket.on('disconnect', (reason: string) => {
			closedHandlers.forEach(cb => cb(reason));
		});

		socket.on('sftp:ready', (info: SftpReady) => {
			sessionId = info.sessionId;
			if (resolved) {
				reconnectedHandlers.forEach(cb => cb(info));
				return;
			}
			resolved = true;
			resolve({
				get sessionId() {
					return sessionId ?? info.sessionId;
				},
				home: info.home,
				serverName: info.serverName,
				user: info.user,
				host: info.host,

				list: path => emit<SftpListing>('sftp:list', { path }),
				mkdir: async (path, name) =>
					(await emit<{ path: string }>('sftp:mkdir', { path, name })).path,
				mkdirp: async (base, dirs) =>
					(await emit<{ created: number }>('sftp:mkdirp', { base, dirs }, MKDIRP_TIMEOUT_MS)).created,
				discard: async (destDir, relPath) => {
					await emit<{ discarded: boolean }>('sftp:discard', { destDir, relPath });
				},
				realpath: async path =>
					(await emit<{ path: string }>('sftp:realpath', { path })).path,

				onClosed: cb => {
					closedHandlers.add(cb);
					return () => closedHandlers.delete(cb);
				},
				onReconnected: cb => {
					reconnectedHandlers.add(cb);
					return () => reconnectedHandlers.delete(cb);
				},
				close: () => {
					closedHandlers.clear();
					reconnectedHandlers.clear();
					socket.disconnect();
				},
			});
		});
	});
}

export interface UploadArgs {
	sessionId: string;
	destDir: string;
	relPath: string;
	body: Blob;
	/** Posición de esta parte en el archivo */
	offset: number;
	/** Tamaño total del archivo */
	total: number;
	overwrite?: boolean;
	onProgress?: (loaded: number) => void;
	signal?: AbortSignal;
}

export interface UploadResult {
	path: string;
	bytes: number;
	overwritten: boolean;
	complete: boolean;
}

/** Código HTTP del `ApiError` con el que rechaza `apiService`; 0 si no hubo respuesta. */
export const uploadErrorStatus = (error: unknown): number | undefined =>
	(error as { statusCode?: number })?.statusCode;

/** Mensaje del `ApiError` (el del backend, o el de la red). */
export const uploadErrorMessage = (error: unknown): string | undefined => {
	const message = (error as { message?: unknown })?.message;
	return typeof message === 'string' ? message : Array.isArray(message) ? message.join(', ') : undefined;
};

/**
 * Sube una parte. El cuerpo va como octet-stream; `timeout: 0` porque el de
 * 30 s del cliente cortaría una parte en una conexión lenta.
 */
export async function uploadRemoteFile(args: UploadArgs): Promise<UploadResult> {
	const params = new URLSearchParams({
		destDir: args.destDir,
		relPath: args.relPath,
		size: String(args.body.size),
		offset: String(args.offset),
		total: String(args.total),
	});
	if (args.overwrite) params.set('overwrite', 'true');

	const response = await apiService.put<UploadResult>(
		`${API_CONFIG.ENDPOINTS.SFTP}/sessions/${args.sessionId}/file?${params.toString()}`,
		args.body,
		{
			headers: { 'Content-Type': 'application/octet-stream' },
			timeout: 0,
			signal: args.signal,
			onUploadProgress: (event: { loaded: number }) => args.onProgress?.(event.loaded),
		},
	);

	/* Mismo desenvuelto defensivo que el resto de servicios: la respuesta puede
	   venir envuelta una o dos veces según el interceptor. */
	const payload = (response as { data?: unknown })?.data ?? response;
	const result = (payload as { data?: unknown })?.data ?? payload;
	return result as UploadResult;
}

export interface DownloadArgs {
	sessionId: string;
	path: string;
	dest: string;
	onProgress: (loaded: number, total: number | null) => void;
	signal: AbortSignal;
}

let downloadSeq = 0;

/** Error de la descarga nativa (`CANCELLED`, `HTTP:<estado>:<cuerpo>`…) en palabras. */
function downloadErrorMessage(raw: string): string {
	const http = /^HTTP:(\d+):([\s\S]*)$/.exec(raw);
	if (http) {
		if (http[1] === '404') return 'La sesión SFTP se cerró; vuelve a abrir el explorador';
		try {
			const { message } = JSON.parse(http[2]) as { message?: string | string[] };
			if (message) return Array.isArray(message) ? message.join('. ') : message;
		} catch { /* cuerpo que no es JSON */ }
		return `El servidor respondió con un error (${http[1]})`;
	}
	if (raw.startsWith('UNREACHABLE:')) return 'No se pudo contactar con el backend';
	if (raw.startsWith('INTERRUPTED:')) return 'La descarga se cortó antes de terminar';
	if (raw.startsWith('FILE:')) return `No se pudo escribir el archivo: ${raw.slice(5)}`;
	return raw;
}

/**
 * Descarga un archivo (o una carpeta como .zip) directo a `dest`, en Rust y
 * fuera del webview (`cloud_download`, src-tauri/src/cloud_download.rs): la
 * ventana no se congela y el archivo no pasa por memoria. Si falla o se
 * cancela, Rust borra lo escrito.
 *
 * Rust no renueva el token: antes se pregunta por la ruta con el cliente HTTP
 * normal, que lo renueva si caducó y trae el error con su mensaje.
 */
export async function downloadRemoteFile(args: DownloadArgs): Promise<void> {
	const url = `${API_CONFIG.ENDPOINTS.SFTP}/sessions/${args.sessionId}/download`;
	const query = new URLSearchParams({ path: args.path }).toString();
	await apiService.get(`${url}/info?${query}`, { signal: args.signal });

	const id = `sftp-${Date.now()}-${++downloadSeq}`;
	const channel = new Channel<{ loaded: number; total: number | null }>();
	channel.onmessage = p => args.onProgress(p.loaded, p.total);
	const cancel = () => { void invoke('cloud_download_cancel', { id }).catch(() => undefined); };
	args.signal.addEventListener('abort', cancel, { once: true });
	try {
		await invoke<number>('cloud_download', {
			id,
			url: `${API_CONFIG.BASE_URL}${url}?${query}`,
			token: TokenManager.getAccessToken(),
			dest: args.dest,
			onProgress: channel,
		});
	} catch (raw) {
		throw new Error(downloadErrorMessage(String(raw)));
	} finally {
		args.signal.removeEventListener('abort', cancel);
	}
}

/** Tamaño legible; el mismo criterio que el resto del panel. */
export const formatSize = (bytes: number): string => {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${bytes} B`;
};

export type { SftpEntry };
