import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadErrorMessage, uploadErrorStatus, uploadRemoteFile } from '@services/sftp.service';
import type { PickedFile } from '@lib/filePicker';
import type { UploadItem } from '@typings/sftp.types';

/** Archivos subiendo a la vez. Más no acelera: satura la conexión SSH. */
const CONCURRENCY = 3;
/** Al aterrizar archivos se refresca el listado, pero no 300 veces seguidas. */
const REFRESH_DEBOUNCE_MS = 500;
/**
 * Tamaño de cada parte. Una petición por archivo entero chocaba con el tiempo
 * máximo del servidor HTTP (5 min en Node) en archivos grandes o conexiones
 * lentas, y cualquier corte tiraba todo lo subido.
 */
const PART_BYTES = 8 * 1024 * 1024;
/** Intentos por parte ante cortes de red o errores del servidor. */
const PART_ATTEMPTS = 4;

interface QueuedFile {
	item: UploadItem;
	picked: PickedFile;
	controller: AbortController;
	overwrite: boolean;
	/** Bytes que el servidor ya confirmó */
	sent: number;
}

interface UploadDeps {
	sessionId: string | null;
	destDir: string;
	mkdirp: (base: string, dirs: string[]) => Promise<void>;
	/** Borra en el servidor el archivo a medias de una subida que no terminó. */
	discard: (destDir: string, relPath: string) => Promise<void>;
	onLanded: () => void;
}

/* Se reintenta lo que puede ser pasajero: sin respuesta (red, 0), 5xx o la
   parte cortada (400). Un 404 es la sesión perdida; 409 y 413 no cambian, y un
   502 es el servidor SFTP diciendo que no (permiso, disco lleno). */
const retryable = (error: unknown) => {
	const status = uploadErrorStatus(error);
	if (!status) return true;
	return status === 400 || status === 408 || status === 429 || (status >= 500 && status !== 502);
};

const wait = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(new DOMException('Cancelado', 'AbortError'));
		}, { once: true });
	});

/**
 * Cola de subidas con progreso y error por archivo.
 *
 * Cada item lleva su destino congelado desde que se encola: el usuario puede
 * seguir navegando mientras algo sube sin que los archivos acaben en otro sitio.
 */
export function useSftpUploads({ sessionId, destDir, mkdirp, discard, onLanded }: UploadDeps) {
	const [items, setItems] = useState<UploadItem[]>([]);
	const queueRef = useRef(new Map<string, QueuedFile>());
	const runningRef = useRef(0);
	const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	/* La sesión puede cambiar al reconectar y el usuario navega mientras sube:
	   las subidas en curso leen siempre el valor de ahora. */
	const live = useRef({ sessionId, destDir, discard, onLanded });
	live.current = { sessionId, destDir, discard, onLanded };

	useEffect(
		() => () => {
			queueRef.current.forEach(entry => entry.controller.abort());
			queueRef.current.clear();
			if (refreshTimer.current) clearTimeout(refreshTimer.current);
		},
		[],
	);

	const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
		setItems(prev => prev.map(item => (item.id === id ? { ...item, ...changes } : item)));
	}, []);

	const scheduleRefresh = useCallback(() => {
		if (refreshTimer.current) clearTimeout(refreshTimer.current);
		refreshTimer.current = setTimeout(() => live.current.onLanded(), REFRESH_DEBOUNCE_MS);
	}, []);

	/** Sube un archivo parte a parte, reintentando cada una por separado. */
	const send = useCallback(async (entry: QueuedFile) => {
		const { item, picked, controller } = entry;
		const signal = controller.signal;
		const total = item.size;
		/* Sin lectura por tramos (archivos de la nube) se descarga una vez y se parte. */
		const whole = picked.slice ? null : await picked.blob();
		const part = (start: number, end: number) =>
			picked.slice ? picked.slice(start, end) : Promise.resolve(whole!.slice(start, end));

		let offset = 0;
		entry.sent = 0;
		do {
			const end = Math.min(total, offset + PART_BYTES);
			const body = await part(offset, end);

			for (let attempt = 1; ; attempt++) {
				const sessionId = live.current.sessionId;
				if (!sessionId) throw new Error('La sesión SFTP no está abierta');
				try {
					await uploadRemoteFile({
						sessionId,
						destDir: item.destDir,
						relPath: item.relPath,
						body,
						offset,
						total,
						overwrite: offset === 0 && entry.overwrite,
						signal,
						onProgress: loaded => patch(item.id, { loaded: offset + loaded }),
					});
					break;
				} catch (error) {
					if (signal.aborted || attempt >= PART_ATTEMPTS || !retryable(error)) throw error;
					patch(item.id, { loaded: offset });
					await wait(1500 * 2 ** (attempt - 1), signal);
				}
			}

			offset = end;
			entry.sent = offset;
			patch(item.id, { loaded: offset });
		} while (offset < total);
	}, [patch]);

	const pump = useCallback(() => {
		while (runningRef.current < CONCURRENCY) {
			const next = [...queueRef.current.values()].find(
				entry => entry.item.status === 'queued',
			);
			if (!next) return;

			runningRef.current++;
			next.item.status = 'uploading';
			patch(next.item.id, { status: 'uploading' });

			void (async () => {
				try {
					await send(next);

					next.item.status = 'done';
					patch(next.item.id, { status: 'done', loaded: next.item.size });
					if (next.item.destDir === live.current.destDir) scheduleRefresh();
				} catch (error: unknown) {
					const aborted = next.controller.signal.aborted;
					const status = uploadErrorStatus(error);
					const conflict = status === 409 && next.sent === 0;

					/* Lo que quedó a medias se borra: en el listado parecería completo.
					   Si falló la primera parte, el servidor ya lo borró. */
					if (next.sent > 0) {
						void live.current.discard(next.item.destDir, next.item.relPath).catch(() => undefined);
					}

					next.item.status = aborted ? 'canceled' : conflict ? 'conflict' : 'error';
					patch(next.item.id, {
						status: next.item.status,
						error: aborted
							? 'Cancelado'
							: conflict
								? 'Ya existe en el destino'
								: status === 413
									? 'Supera el tamaño máximo permitido'
									: status === 404
										? 'La sesión SFTP se cerró; vuelve a abrir el explorador'
										: uploadErrorMessage(error) ??
											(error instanceof Error ? error.message : 'No se pudo subir'),
					});
				} finally {
					runningRef.current--;
					pump();
				}
			})();
		}
	}, [patch, scheduleRefresh, send]);

	const enqueue = useCallback(
		async (files: PickedFile[]) => {
			if (files.length === 0 || !sessionId) return;

			/* Los directorios se crean de una vez antes de encolar: así varias
			   subidas en paralelo no compiten por crear la misma carpeta. */
			const dirs = new Set<string>();
			for (const file of files) {
				const slash = file.relPath.lastIndexOf('/');
				if (slash > 0) dirs.add(file.relPath.slice(0, slash));
			}
			if (dirs.size > 0) await mkdirp(destDir, [...dirs]);

			const queued: UploadItem[] = files.map(file => ({
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				relPath: file.relPath,
				name: file.name,
				size: file.size,
				loaded: 0,
				status: 'queued' as const,
				destDir,
			}));

			queued.forEach((item, index) => {
				queueRef.current.set(item.id, {
					item,
					picked: files[index],
					controller: new AbortController(),
					overwrite: false,
					sent: 0,
				});
			});

			setItems(prev => [...prev, ...queued]);
			pump();
		},
		[sessionId, destDir, mkdirp, pump],
	);

	const cancel = useCallback((id: string) => {
		const entry = queueRef.current.get(id);
		if (!entry) return;
		entry.controller.abort();
		/* Uno en cola no llega a arrancar: se marca aquí. */
		if (entry.item.status === 'queued') {
			entry.item.status = 'canceled';
			patch(id, { status: 'canceled', error: 'Cancelado' });
		}
	}, [patch]);

	const retry = useCallback(
		(id: string, overwrite = false) => {
			const entry = queueRef.current.get(id);
			if (!entry) return;

			entry.controller = new AbortController();
			entry.overwrite = overwrite;
			entry.item.status = 'queued';
			entry.item.loaded = 0;
			patch(id, { status: 'queued', loaded: 0, error: undefined });
			pump();
		},
		[patch, pump],
	);

	/** Sobrescribe todos los que chocaron, para no pulsar 200 veces. */
	const retryAllConflicts = useCallback(() => {
		items
			.filter(item => item.status === 'conflict')
			.forEach(item => retry(item.id, true));
	}, [items, retry]);

	/** Reintenta todos los que fallaron (p. ej. tras un corte de red largo). */
	const retryAllFailed = useCallback(() => {
		items
			.filter(item => item.status === 'error')
			.forEach(item => retry(item.id));
	}, [items, retry]);

	const clearFinished = useCallback(() => {
		setItems(prev =>
			prev.filter(item => {
				const finished = ['done', 'canceled', 'error'].includes(item.status);
				if (finished) queueRef.current.delete(item.id);
				return !finished;
			}),
		);
	}, []);

	const totals = items.reduce(
		(acc, item) => ({
			files: acc.files + 1,
			done: acc.done + (item.status === 'done' ? 1 : 0),
			failed: acc.failed + (item.status === 'error' ? 1 : 0),
			conflicts: acc.conflicts + (item.status === 'conflict' ? 1 : 0),
			bytes: acc.bytes + item.size,
			loaded: acc.loaded + (item.status === 'done' ? item.size : item.loaded),
		}),
		{ files: 0, done: 0, failed: 0, conflicts: 0, bytes: 0, loaded: 0 },
	);

	return {
		items,
		totals,
		enqueue,
		cancel,
		retry,
		retryAllConflicts,
		retryAllFailed,
		clearFinished,
		busy: items.some(item => item.status === 'queued' || item.status === 'uploading'),
	};
}
