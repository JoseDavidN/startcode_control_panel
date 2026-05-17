import { useCallback, useEffect, useRef, useState } from 'react';
import { IS_TAURI } from '@lib/tauriStore';

export interface UpdateInfo {
	version: string;
	body: string;
}

export interface UpdaterState {
	checking: boolean;
	available: boolean;
	info: UpdateInfo | null;
	downloading: boolean;
	progress: number;
	error: string | null;
}

export function useUpdater(checkOnMount = true) {
	const [state, setState] = useState<UpdaterState>({
		checking: false,
		available: false,
		info: null,
		downloading: false,
		progress: 0,
		error: null,
	});

	const checkedRef = useRef(false);

	const checkForUpdates = useCallback(async () => {
		if (!IS_TAURI) return;

		setState((s) => ({ ...s, checking: true, error: null }));
		try {
			const { check } = await import('@tauri-apps/plugin-updater');
			const update = await check();
			if (update) {
				setState((s) => ({
					...s,
					checking: false,
					available: true,
					info: { version: update.version, body: update.body ?? '' },
				}));
			} else {
				setState((s) => ({ ...s, checking: false }));
			}
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			setState((s) => ({ ...s, checking: false, error: msg }));
		}
	}, []);

	const installUpdate = useCallback(async () => {
		if (!IS_TAURI || !state.available) return;

		setState((s) => ({ ...s, downloading: true, progress: 0, error: null }));
		try {
			const { check } = await import('@tauri-apps/plugin-updater');
			const { relaunch } = await import('@tauri-apps/plugin-process');
			const update = await check();

			if (!update) {
				setState((s) => ({ ...s, downloading: false }));
				return;
			}

			let downloaded = 0;
			let total = 0;

			await update.downloadAndInstall((event) => {
				switch (event.event) {
					case 'Started':
						total = event.data.contentLength ?? 0;
						break;
					case 'Progress':
						downloaded += event.data.chunkLength;
						setState((s) => ({
							...s,
							progress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
						}));
						break;
					case 'Finished':
						setState((s) => ({ ...s, progress: 100 }));
						break;
				}
			});

			await relaunch();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			setState((s) => ({ ...s, downloading: false, error: msg }));
		}
	}, [state.available]);

	useEffect(() => {
		if (checkOnMount && !checkedRef.current) {
			checkedRef.current = true;
			checkForUpdates();
		}
	}, [checkOnMount, checkForUpdates]);

	return { ...state, checkForUpdates, installUpdate };
}
