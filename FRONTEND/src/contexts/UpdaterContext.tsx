import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { storeGet, storeSet } from '@lib/tauriStore';
import { notify } from '@services/notification.service';
import { UpdaterContext, type UpdatePrefs, type UpdaterContextValue, type UpdaterState } from '@contexts/updater-context';

/**
 * Actualizador de la app de escritorio, montado una vez para toda la app.
 *
 * Busca versión nueva 15 s después de abrir y luego cada 6 h. Lo que hace al
 * encontrarla depende de dos preferencias, guardadas en el store local de
 * Tauri (`startcode:updates`), no en la cuenta: son de esta instalación.
 *
 * - `auto`: descarga en segundo plano. En Linux y macOS además la instala
 *   (sustituye el binario) y entra en vigor al reiniciar; en Windows instalar
 *   lanza el instalador y cierra la app, así que espera a que el usuario
 *   pulse «Reiniciar».
 * - `notify`: muestra un aviso con la acción correspondiente. En Windows el
 *   aviso de «lista» sale siempre: sin él la descarga no se aplicaría nunca.
 */

const PREFS_KEY = 'startcode:updates';
const DEFAULT_PREFS: UpdatePrefs = { auto: true, notify: true };
const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_EVERY_MS = 6 * 60 * 60_000;
const IS_WINDOWS = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);

const INITIAL: UpdaterState = {
	checking: false,
	available: false,
	info: null,
	downloading: false,
	progress: 0,
	ready: false,
	error: null,
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const UpdaterProvider = ({ children }: { children: ReactNode }) => {
	const [state, setState] = useState<UpdaterState>(INITIAL);
	const [prefs, setPrefs] = useState<UpdatePrefs>(DEFAULT_PREFS);
	const [prefsLoaded, setPrefsLoaded] = useState(false);

	/* Lo que leen los callbacks del temporizador sin recrearse. */
	const prefsRef = useRef(prefs);
	const stateRef = useRef(state);
	const updateRef = useRef<Update | null>(null);
	const busyRef = useRef(false);
	/* Versión ya avisada: un aviso por versión, no uno cada 6 h. */
	const notifiedRef = useRef<string | null>(null);
	/* El aviso de «disponible» instala con la versión vigente de `installUpdate`. */
	const installRef = useRef<() => Promise<void>>(() => Promise.resolve());

	useEffect(() => { prefsRef.current = prefs; }, [prefs]);
	useEffect(() => { stateRef.current = state; }, [state]);

	useEffect(() => {
		void storeGet<Partial<UpdatePrefs>>(PREFS_KEY)
			.then(saved => { if (saved) setPrefs({ ...DEFAULT_PREFS, ...saved }); })
			.catch(() => undefined)
			.finally(() => setPrefsLoaded(true));
	}, []);

	/** Descarga; fuera de Windows además instala, que solo sustituye archivos. */
	const download = useCallback(async (update: Update) => {
		setState(s => ({ ...s, downloading: true, progress: 0, error: null }));
		let downloaded = 0;
		let total = 0;
		await update.download(event => {
			if (event.event === 'Started') total = event.data.contentLength ?? 0;
			if (event.event === 'Progress') {
				downloaded += event.data.chunkLength;
				const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
				setState(s => ({ ...s, progress }));
			}
		});
		if (!IS_WINDOWS) await update.install();
		setState(s => ({ ...s, downloading: false, progress: 100, ready: true }));
	}, []);

	const restart = useCallback(async () => {
		const update = updateRef.current;
		/* En Windows `install()` abre el instalador y cierra la app. */
		if (IS_WINDOWS && update) await update.install();
		const { relaunch } = await import('@tauri-apps/plugin-process');
		await relaunch();
	}, []);

	const announce = useCallback((version: string, ready: boolean) => {
		if (notifiedRef.current === `${version}:${ready}`) return;
		notifiedRef.current = `${version}:${ready}`;

		if (ready) {
			notify.action(
				`StartCode Panel v${version} lista`,
				IS_WINDOWS ? 'Reinicia para instalarla.' : 'Se aplicará la próxima vez que abras la app.',
				'Reiniciar ahora',
				() => { void restart(); },
			);
		} else {
			notify.action(
				`StartCode Panel v${version} disponible`,
				'Puedes instalarla ahora; la app se reiniciará al terminar.',
				'Instalar',
				() => { void installRef.current(); },
			);
		}
	}, [restart]);

	/** `background`: sin errores a la vista ni avisos si se busca a mano. */
	const run = useCallback(async (background: boolean) => {
		if (busyRef.current || stateRef.current.ready) return;
		busyRef.current = true;
		setState(s => ({ ...s, checking: true, error: background ? s.error : null }));

		try {
			const { check } = await import('@tauri-apps/plugin-updater');
			const update = await check();
			if (!update) {
				setState(s => ({ ...s, checking: false, available: false, info: null }));
				return;
			}

			updateRef.current = update;
			setState(s => ({
				...s,
				checking: false,
				available: true,
				info: { version: update.version, body: update.body ?? '' },
			}));

			const { auto, notify: wantsNotice } = prefsRef.current;
			if (auto) {
				await download(update);
				if (wantsNotice || IS_WINDOWS) announce(update.version, true);
			} else if (wantsNotice && background) {
				announce(update.version, false);
			}
		} catch (e: unknown) {
			setState(s => ({ ...s, checking: false, downloading: false, error: background ? s.error : errorText(e) }));
		} finally {
			busyRef.current = false;
		}
	}, [announce, download]);

	const checkForUpdates = useCallback(() => run(false), [run]);

	const installUpdate = useCallback(async () => {
		try {
			if (!stateRef.current.ready) {
				const update = updateRef.current ?? await (await import('@tauri-apps/plugin-updater')).check();
				if (!update) return;
				updateRef.current = update;
				await download(update);
			}
			await restart();
		} catch (e: unknown) {
			setState(s => ({ ...s, downloading: false, error: errorText(e) }));
		}
	}, [download, restart]);

	useEffect(() => { installRef.current = installUpdate; }, [installUpdate]);

	/* Comprobación en segundo plano, cuando ya se saben las preferencias. */
	useEffect(() => {
		if (!prefsLoaded) return;
		const first = window.setTimeout(() => { void run(true); }, FIRST_CHECK_DELAY_MS);
		const every = window.setInterval(() => { void run(true); }, CHECK_EVERY_MS);
		return () => { window.clearTimeout(first); window.clearInterval(every); };
	}, [prefsLoaded, run]);

	const setPref = useCallback((key: keyof UpdatePrefs, value: boolean) => {
		setPrefs(prev => {
			const next = { ...prev, [key]: value };
			void storeSet(PREFS_KEY, next).catch(() => undefined);
			return next;
		});

		/* Al activar la descarga automática con una versión ya encontrada. */
		const current = stateRef.current;
		const update = updateRef.current;
		if (key === 'auto' && value && update && current.available && !current.ready && !current.downloading) {
			void download(update).catch((e: unknown) => setState(s => ({ ...s, downloading: false, error: errorText(e) })));
		}
	}, [download]);

	const value = useMemo<UpdaterContextValue>(
		() => ({ ...state, prefs, setPref, checkForUpdates, installUpdate }),
		[state, prefs, setPref, checkForUpdates, installUpdate],
	);

	return <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>;
};
