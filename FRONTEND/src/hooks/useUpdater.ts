import { useContext } from 'react';
import { UpdaterContext, type UpdaterContextValue } from '@contexts/updater-context';

export type { UpdateInfo, UpdatePrefs, UpdaterState } from '@contexts/updater-context';

/** Estado y acciones del actualizador global (`UpdaterProvider`). */
export function useUpdater(): UpdaterContextValue {
	const ctx = useContext(UpdaterContext);
	if (!ctx) throw new Error('useUpdater debe usarse dentro de <UpdaterProvider>');
	return ctx;
}
