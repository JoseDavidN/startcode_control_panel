import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadRemoteFile, uploadErrorMessage, uploadErrorStatus } from '@services/sftp.service';
import type { DownloadItem } from '@typings/sftp.types';

/** Descargas a la vez: comparten la conexión SSH con la navegación y las subidas. */
const CONCURRENCY = 3;

export interface DownloadJob {
	path: string;
	name: string;
	folder: boolean;
	dest: string;
	size: number | null;
}

/** Cola de descargas. Viven con el modal: al cerrarlo se cancelan, como las subidas. */
export function useSftpDownloads(sessionId: string | null) {
	const [items, setItems] = useState<DownloadItem[]>([]);
	const queue = useRef(new Map<string, { item: DownloadItem; controller: AbortController }>());
	const running = useRef(0);

	/* La sesión puede cambiar al reconectar: se lee la de ahora al arrancar cada una. */
	const session = useRef(sessionId);
	session.current = sessionId;

	useEffect(() => {
		const entries = queue.current;
		return () => {
			entries.forEach(entry => entry.controller.abort());
			entries.clear();
		};
	}, []);

	const patch = useCallback((id: string, changes: Partial<DownloadItem>) => {
		const entry = queue.current.get(id);
		if (entry) Object.assign(entry.item, changes);
		setItems(prev => prev.map(item => (item.id === id ? { ...item, ...changes } : item)));
	}, []);

	const pump = useCallback(() => {
		while (running.current < CONCURRENCY) {
			const next = [...queue.current.values()].find(entry => entry.item.status === 'queued');
			if (!next) return;

			running.current++;
			const { item, controller } = next;
			patch(item.id, { status: 'downloading', loaded: 0, error: undefined });

			void (async () => {
				try {
					const sessionId = session.current;
					if (!sessionId) throw new Error('La sesión SFTP no está abierta');
					await downloadRemoteFile({
						sessionId,
						path: item.path,
						dest: item.dest,
						signal: controller.signal,
						onProgress: (loaded, total) => patch(item.id, { loaded, total }),
					});
					patch(item.id, { status: 'done' });
				} catch (error: unknown) {
					if (controller.signal.aborted) {
						patch(item.id, { status: 'canceled', error: 'Cancelado' });
					} else {
						patch(item.id, {
							status: 'error',
							error: uploadErrorStatus(error) === 404
								? 'La sesión SFTP se cerró; vuelve a abrir el explorador'
								: uploadErrorMessage(error) ?? (error instanceof Error ? error.message : 'No se pudo descargar'),
						});
					}
				} finally {
					running.current--;
					pump();
				}
			})();
		}
	}, [patch]);

	const enqueue = useCallback((jobs: DownloadJob[]) => {
		const added = jobs.map((job): DownloadItem => ({
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			path: job.path,
			name: job.name,
			folder: job.folder,
			dest: job.dest,
			loaded: 0,
			total: job.size,
			status: 'queued',
		}));
		added.forEach(item => queue.current.set(item.id, { item, controller: new AbortController() }));
		setItems(prev => [...prev, ...added]);
		pump();
	}, [pump]);

	const cancel = useCallback((id: string) => {
		const entry = queue.current.get(id);
		if (!entry) return;
		entry.controller.abort();
		/* Una en cola no llega a arrancar: se marca aquí. */
		if (entry.item.status === 'queued') patch(id, { status: 'canceled', error: 'Cancelado' });
	}, [patch]);

	const retry = useCallback((id: string) => {
		const entry = queue.current.get(id);
		if (!entry) return;
		entry.controller = new AbortController();
		patch(id, { status: 'queued', loaded: 0, error: undefined });
		pump();
	}, [patch, pump]);

	const clearFinished = useCallback(() => {
		const finished = (item: DownloadItem) => ['done', 'canceled', 'error'].includes(item.status);
		queue.current.forEach((entry, id) => {
			if (finished(entry.item)) queue.current.delete(id);
		});
		setItems(prev => prev.filter(item => !finished(item)));
	}, []);

	return { items, enqueue, cancel, retry, clearFinished };
}
