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
	onClosed(cb: (reason: string) => void): () => void;
	close(): void;
}

const socketBase = () => API_CONFIG.WS_URL;

/**
 * Abre la sesión SFTP. Vive mientras el modal esté abierto: al cerrar el
 * socket, el backend suelta la conexión SSH.
 */
export function openSftpConnection(serverId: string): Promise<SftpConnection> {
	return new Promise((resolve, reject) => {
		const socket: Socket = io(`${socketBase()}/sftp`, {
			transports: ['websocket'],
			auth: { token: TokenManager.getAccessToken(), serverId },
		});

		const closedHandlers = new Set<(reason: string) => void>();
		watchSessionRevoked(socket);

		const emit = <T,>(event: string, payload: unknown): Promise<T> =>
			new Promise<T>((ok, fail) => {
				const timer = setTimeout(
					() => fail(new Error('El servidor no respondió a tiempo')),
					ACK_TIMEOUT_MS,
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
			reject(new Error(payload?.message ?? 'No se pudo abrir la sesión SFTP'));
		});

		socket.on('disconnect', (reason: string) => {
			closedHandlers.forEach(cb => cb(reason));
		});

		socket.on('sftp:ready', (info: SftpReady) => {
			resolve({
				sessionId: info.sessionId,
				home: info.home,
				serverName: info.serverName,
				user: info.user,
				host: info.host,

				list: path => emit<SftpListing>('sftp:list', { path }),
				mkdir: async (path, name) =>
					(await emit<{ path: string }>('sftp:mkdir', { path, name })).path,
				mkdirp: async (base, dirs) =>
					(await emit<{ created: number }>('sftp:mkdirp', { base, dirs })).created,
				realpath: async path =>
					(await emit<{ path: string }>('sftp:realpath', { path })).path,

				onClosed: cb => {
					closedHandlers.add(cb);
					return () => closedHandlers.delete(cb);
				},
				close: () => {
					closedHandlers.clear();
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
	overwrite?: boolean;
	onProgress?: (loaded: number, total: number) => void;
	signal?: AbortSignal;
}

export interface UploadResult {
	path: string;
	bytes: number;
	overwritten: boolean;
}

/** Código HTTP de un error de axios, si lo hay. */
export const uploadErrorStatus = (error: unknown): number | undefined =>
	(error as { response?: { status?: number } })?.response?.status;

/**
 * Sube un archivo. El cuerpo va como octet-stream para que el navegador lo
 * transmita desde disco sin cargarlo en memoria; `timeout: 0` es obligatorio,
 * porque el de 30 s del cliente cortaría cualquier archivo grande.
 */
export async function uploadRemoteFile(args: UploadArgs): Promise<UploadResult> {
	const params = new URLSearchParams({
		destDir: args.destDir,
		relPath: args.relPath,
		size: String(args.body.size),
	});
	if (args.overwrite) params.set('overwrite', 'true');

	const response = await apiService.put<UploadResult>(
		`${API_CONFIG.ENDPOINTS.SFTP}/sessions/${args.sessionId}/file?${params.toString()}`,
		args.body,
		{
			headers: { 'Content-Type': 'application/octet-stream' },
			timeout: 0,
			signal: args.signal,
			onUploadProgress: (event: { loaded: number; total?: number }) => {
				args.onProgress?.(event.loaded, event.total ?? args.body.size);
			},
		},
	);

	/* Mismo desenvuelto defensivo que el resto de servicios: la respuesta puede
	   venir envuelta una o dos veces según el interceptor. */
	const payload = (response as { data?: unknown })?.data ?? response;
	const result = (payload as { data?: unknown })?.data ?? payload;
	return result as UploadResult;
}

/** Tamaño legible; el mismo criterio que el resto del panel. */
export const formatSize = (bytes: number): string => {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${bytes} B`;
};

export type { SftpEntry };
