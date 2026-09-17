import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadErrorStatus, uploadRemoteFile } from '@services/sftp.service';
import type { PickedFile } from '@lib/filePicker';
import type { UploadItem } from '@typings/sftp.types';

/** Archivos subiendo a la vez. Más no acelera: satura la conexión SSH. */
const CONCURRENCY = 3;
/** Al aterrizar archivos se refresca el listado, pero no 300 veces seguidas. */
const REFRESH_DEBOUNCE_MS = 500;

interface QueuedFile {
	item: UploadItem;
	picked: PickedFile;
	controller: AbortController;
	overwrite: boolean;
}

/**
 * Cola de subidas con progreso y error por archivo.
 *
 * Cada item lleva su destino congelado desde que se encola: el usuario puede
 * seguir navegando mientras algo sube sin que los archivos acaben en otro sitio.
 */
export function useSftpUploads(
	sessionId: string | null,
	destDir: string,
	mkdirp: (base: string, dirs: string[]) => Promise<void>,
	onLanded: () => void,
) {
	const [items, setItems] = useState<UploadItem[]>([]);
	const queueRef = useRef(new Map<string, QueuedFile>());
	const runningRef = useRef(0);
	const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const landedRef = useRef(onLanded);
	landedRef.current = onLanded;

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
		refreshTimer.current = setTimeout(() => landedRef.current(), REFRESH_DEBOUNCE_MS);
	}, []);

	const pump = useCallback(() => {
		if (!sessionId) return;

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
					const body = await next.picked.blob();
					await uploadRemoteFile({
						sessionId,
						destDir: next.item.destDir,
						relPath: next.item.relPath,
						body,
						overwrite: next.overwrite,
						signal: next.controller.signal,
						onProgress: loaded => patch(next.item.id, { loaded }),
					});

					next.item.status = 'done';
					patch(next.item.id, { status: 'done', loaded: next.item.size });
					if (next.item.destDir === destDir) scheduleRefresh();
				} catch (error: unknown) {
					const aborted = next.controller.signal.aborted;
					const status = uploadErrorStatus(error);

					next.item.status = aborted ? 'canceled' : status === 409 ? 'conflict' : 'error';
					patch(next.item.id, {
						status: next.item.status,
						error: aborted
							? 'Cancelado'
							: status === 409
								? 'Ya existe en el destino'
								: status === 413
									? 'Supera el tamaño máximo permitido'
									: error instanceof Error
										? error.message
										: 'No se pudo subir',
					});
				} finally {
					runningRef.current--;
					pump();
				}
			})();
		}
	}, [sessionId, destDir, patch, scheduleRefresh]);

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
				});
			});

			setItems(prev => [...prev, ...queued]);
			pump();
		},
		[sessionId, destDir, mkdirp, pump],
	);

	const cancel = useCallback((id: string) => {
		queueRef.current.get(id)?.controller.abort();
	}, []);

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
		clearFinished,
		busy: items.some(item => item.status === 'queued' || item.status === 'uploading'),
	};
}
