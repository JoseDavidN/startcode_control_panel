import { createContext } from 'react';

/* Tipos y contexto del actualizador, aparte del proveedor (UpdaterContext.tsx)
   para que ese archivo solo exporte componentes. */

export interface UpdateInfo {
	version: string;
	body: string;
}

export interface UpdatePrefs {
	/** Descargar (e instalar si la plataforma lo permite) en segundo plano. */
	auto: boolean;
	/** Avisar cuando haya versión nueva o esté lista para aplicar. */
	notify: boolean;
}

export interface UpdaterState {
	checking: boolean;
	available: boolean;
	info: UpdateInfo | null;
	downloading: boolean;
	progress: number;
	/** Descargada (e instalada fuera de Windows): falta reiniciar. */
	ready: boolean;
	error: string | null;
}

export interface UpdaterContextValue extends UpdaterState {
	prefs: UpdatePrefs;
	setPref: (key: keyof UpdatePrefs, value: boolean) => void;
	checkForUpdates: () => Promise<void>;
	installUpdate: () => Promise<void>;
}

export const UpdaterContext = createContext<UpdaterContextValue | null>(null);
