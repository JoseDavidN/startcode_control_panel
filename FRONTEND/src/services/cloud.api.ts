// src/services/cloud.api.ts
import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { ApiError } from '@typings/api.types';
import type {
	CloudConnection, CloudFolder, CloudPaths, CloudPathsConfig, CloudSection, CloudStats, CloudStorage, CloudStream,
} from '@typings/cloud.types';
import type { PickedFile } from '@lib/filePicker';
import { Channel, invoke } from '@tauri-apps/api/core';

/**
 * Cliente del backend de StartCode Cloud (`CLOUD/`). Es otro servidor que el
 * del panel: su URL y su token salen de la conexión guardada en el equipo
 * (`useCloudConnection`), no de `API_CONFIG`, así que no usa `apiService`.
 *
 * Las rutas son relativas a la raíz de la sección: los `id` del árbol.
 */

const PREFIX = '/api/v1';
const TIMEOUT = 30_000;

/** Origen tal como lo escribe el usuario → `http(s)://host:puerto`, sin barra ni `/api/v1`. */
export function normalizeCloudUrl(raw: string): string {
	let url = raw.trim();
	if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
	return url.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}

let connection: CloudConnection | null = null;

/** Lo que este webview reproduce por sí mismo, además de H.264 y AAC. */
function mediaCaps(): { hevc: boolean; vp9: boolean; av1: boolean; webm: boolean } {
	const v = document.createElement('video');
	const can = (type: string) => v.canPlayType(type) !== '';
	return {
		hevc: can('video/mp4; codecs="hvc1.1.6.L93.B0"'),
		vp9: can('video/mp4; codecs="vp09.00.10.08"'),
		av1: can('video/mp4; codecs="av01.0.05M.08"'),
		webm: can('video/webm; codecs="vp8, vorbis"'),
	};
}
let onSessionLost: ((message: string) => void) | null = null;

/** La conexión activa la fija `useCloudConnection`; sin ella las llamadas fallan. */
export function setCloudConnection(next: CloudConnection | null): void {
	connection = next;
}

/** Aviso cuando la nube rechaza el token (sesión cerrada o expirada). */
export function onCloudSessionLost(handler: ((message: string) => void) | null): void {
	onSessionLost = handler;
}

/** Error de la nube con los campos de ApiError (`statusCode`, `code`, `hint`). */
export class CloudApiError extends Error implements ApiError {
	readonly statusCode: number;
	readonly code?: string;
	readonly hint?: string;
	readonly errors?: Record<string, string[]>;

	constructor(message: string, statusCode: number, code?: string, hint?: string, errors?: Record<string, string[]>) {
		super(message);
		this.name = 'CloudApiError';
		this.statusCode = statusCode;
		this.code = code;
		this.hint = hint;
		this.errors = errors;
	}
}

/* En las descargas el cuerpo del error llega como Blob y hay que leerlo. */
async function toApiError(error: unknown): Promise<CloudApiError> {
	const err = error as AxiosError;
	if (!err.response) {
		return new CloudApiError('No se pudo contactar con la nube.', 0, 'UNREACHABLE', 'Comprueba que el servidor de la nube esté encendido y accesible.');
	}
	let data: unknown = err.response.data;
	try {
		if (data instanceof Blob) data = JSON.parse(await data.text());
		else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) data = JSON.parse(new TextDecoder().decode(data));
		else if (typeof data === 'string') data = JSON.parse(data);
	} catch {
		data = null;
	}
	const body = (data ?? {}) as { message?: string | string[]; code?: string; hint?: string; errors?: Record<string, string[]> };
	const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
	return new CloudApiError(
		message || (err.response.status === 429 ? 'Demasiados intentos seguidos. Espera un minuto.' : 'La nube respondió con un error.'),
		err.response.status,
		body.code,
		body.hint,
		body.errors,
	);
}

let downloadSeq = 0;

/** Error de `cloud_download` (`CANCELLED`, `UNREACHABLE:…`, `HTTP:<estado>:<cuerpo>`…) → CloudApiError. */
function downloadError(raw: string): CloudApiError {
	if (raw === 'CANCELLED') return new CloudApiError('Descarga cancelada.', 0, 'CANCELLED');
	const http = /^HTTP:(\d+):([\s\S]*)$/.exec(raw);
	if (http) {
		let body: { message?: string | string[]; code?: string; hint?: string } = {};
		try { body = JSON.parse(http[2]) as typeof body; } catch { /* cuerpo que no es JSON */ }
		const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
		const error = new CloudApiError(message || 'La nube respondió con un error.', Number(http[1]), body.code, body.hint);
		if (error.statusCode === 401 && body.code?.startsWith('TOKEN_')) onSessionLost?.(error.message);
		return error;
	}
	if (raw.startsWith('UNREACHABLE:')) {
		return new CloudApiError('No se pudo contactar con la nube.', 0, 'UNREACHABLE', 'Comprueba que el servidor de la nube esté encendido y accesible.');
	}
	if (raw.startsWith('FILE:')) return new CloudApiError('No se pudo escribir el archivo en el equipo.', 0, 'FILE_ERROR', raw.slice(5));
	return new CloudApiError('Se cortó la descarga.', 0, 'DOWNLOAD_INTERRUPTED', raw.replace(/^INTERRUPTED:/, ''));
}

function client(base?: string, token?: string): AxiosInstance {
	const url = base ?? connection?.url;
	if (!url) throw new CloudApiError('La nube no está conectada.', 0, 'NOT_CONNECTED');
	const instance = axios.create({
		baseURL: `${url}${PREFIX}`,
		timeout: TIMEOUT,
		headers: token ?? connection?.token ? { Authorization: `Bearer ${token ?? connection?.token}` } : {},
	});
	instance.interceptors.response.use(undefined, async (error: unknown) => {
		const apiError = await toApiError(error);
		if (apiError.statusCode === 401 && !base && apiError.code?.startsWith('TOKEN_')) onSessionLost?.(apiError.message);
		return Promise.reject(apiError);
	});
	return instance;
}

export const cloudApi = {
	/** Comprueba que la URL sea una StartCode Cloud; devuelve su versión. */
	async health(url: string): Promise<{ version: string }> {
		const { data } = await client(url).get<{ service?: string; version?: string }>('/health', { timeout: 8_000 });
		if (data?.service !== 'startcode-cloud') {
			throw new CloudApiError('En esa URL no responde una StartCode Cloud.', 0, 'NOT_A_CLOUD', 'Revisa la dirección y el puerto del servidor de la nube.');
		}
		return { version: data.version ?? '' };
	},

	async login(url: string, username: string, password: string, deviceName: string) {
		const { data } = await client(url).post<{ token: string; username: string; expiresAt: string }>('/auth/login', { username, password, deviceName });
		return data;
	},

	/** Cierra la sesión en la nube; con `token` explícito sirve para la que se está olvidando. */
	async logout(url: string, token: string): Promise<void> {
		await client(url, token).post('/auth/logout');
	},

	async me(): Promise<{ username: string; version: string }> {
		return (await client().get<{ username: string; version: string }>('/auth/me')).data;
	},

	async tree(section: CloudSection): Promise<CloudFolder> {
		return (await client().get<CloudFolder>(`/tree/${section}`, { timeout: 120_000 })).data;
	},

	async storage(): Promise<CloudStorage> {
		return (await client().get<CloudStorage>('/storage')).data;
	},

	/** Resumen para el dashboard; la nube recorre el disco y lo guarda un minuto. */
	async stats(): Promise<CloudStats> {
		return (await client().get<CloudStats>('/stats', { timeout: 120_000 })).data;
	},

	async getPaths(): Promise<CloudPathsConfig> {
		return (await client().get<CloudPathsConfig>('/config/paths')).data;
	},

	async savePaths(paths: CloudPaths): Promise<CloudPathsConfig> {
		return (await client().put<CloudPathsConfig>('/config/paths', paths)).data;
	},

	async createFolder(section: CloudSection, parent: string, name: string): Promise<void> {
		await client().post('/folders', { section, parent, name });
	},

	/** Sube un archivo en streaming; `onProgress` recibe los bytes enviados de ese archivo. */
	async upload(section: CloudSection, parent: string, file: PickedFile, onProgress: (loaded: number) => void): Promise<void> {
		const blob = await file.blob();
		await client().put('/files', blob, {
			params: { section, parent, relPath: file.relPath, size: blob.size },
			headers: { 'Content-Type': 'application/octet-stream' },
			timeout: 0,
			onUploadProgress: e => onProgress(e.loaded),
		});
	},

	/** Miniatura de una imagen o portada de un video; falla con 404 si no tiene. */
	async thumbnail(section: CloudSection, path: string): Promise<Blob> {
		return (await client().get<Blob>('/files/thumbnail', { params: { section, path }, responseType: 'blob', timeout: 60_000 })).data;
	},

	async content(section: CloudSection, path: string): Promise<Blob> {
		return (await client().get<Blob>('/files/content', { params: { section, path }, responseType: 'blob', timeout: 0 })).data;
	},

	/**
	 * Cómo reproducir un video. La nube lo analiza con ffprobe y, según lo que
	 * este webview reproduce (`canPlayType`), lo sirve tal cual a tramos
	 * (`direct`), re-empaquetado (`remux`) o convertido a H.264 (`transcode`).
	 * La URL lleva un ticket firmado de ese archivo porque `<video>` no manda
	 * la cabecera del token.
	 */
	async stream(section: CloudSection, path: string): Promise<CloudStream> {
		const { data } = await client().post<Omit<CloudStream, 'url'> & { url: string }>(
			'/files/stream-ticket',
			{ section, path, client: mediaCaps() },
		);
		return { ...data, url: `${connection?.url ?? ''}${data.url}` };
	},

	/** Al saltar en `remux`/`transcode`: segundo real desde el que empezará (fotograma clave). */
	async seekPoint(stream: CloudStream, t: number): Promise<number> {
		const url = stream.url.replace('/files/play?', '/files/seek-point?');
		const res = await fetch(`${url}&t=${t.toFixed(3)}`);
		if (!res.ok) return t;
		return ((await res.json()) as { start: number }).start;
	},

	/**
	 * Descarga un archivo (o una carpeta como .zip) directo a `dest`, la ruta
	 * elegida en el diálogo. La hace Rust en segundo plano (`cloud_download`,
	 * src-tauri/src/cloud_download.rs): el webview solo recibe el progreso, así
	 * que la app sigue respondiendo con archivos grandes. Abortar `signal`
	 * cancela la descarga y borra lo escrito.
	 */
	async download(
		section: CloudSection, path: string, folder: boolean, dest: string,
		onProgress: (loaded: number, total: number | null) => void, signal: AbortSignal,
	): Promise<void> {
		if (!connection) throw new CloudApiError('La nube no está conectada.', 0, 'NOT_CONNECTED');
		const query = new URLSearchParams({ section, path });
		const id = `dl-${Date.now()}-${++downloadSeq}`;
		const channel = new Channel<{ loaded: number; total: number | null }>();
		channel.onmessage = p => onProgress(p.loaded, p.total);
		const cancel = () => { void invoke('cloud_download_cancel', { id }).catch(() => undefined); };
		signal.addEventListener('abort', cancel, { once: true });
		try {
			await invoke<number>('cloud_download', {
				id,
				url: `${connection.url}${PREFIX}/files/${folder ? 'zip' : 'content'}?${query.toString()}`,
				token: connection.token,
				dest,
				onProgress: channel,
			});
		} catch (raw) {
			throw downloadError(String(raw));
		} finally {
			signal.removeEventListener('abort', cancel);
		}
	},

	async rename(section: CloudSection, path: string, name: string): Promise<void> {
		await client().patch('/entries/rename', { section, path, name });
	},

	async move(section: CloudSection, path: string, toSection: CloudSection, toParent: string): Promise<void> {
		await client().post('/entries/move', { section, path, toSection, toParent });
	},

	async remove(section: CloudSection, path: string): Promise<void> {
		await client().delete('/entries', { params: { section, path } });
	},
};

/** Mensaje legible de un error de la nube (con su pista, si la hay). */
export function cloudErrorMessage(error: unknown, fallback = 'La nube respondió con un error.'): string {
	const e = error as Partial<ApiError> | undefined;
	if (!e?.message) return fallback;
	return e.hint ? `${e.message} ${e.hint}` : e.message;
}
