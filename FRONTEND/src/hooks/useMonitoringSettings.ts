import { useCallback } from 'react';
import { usePreferences } from '@hooks/usePreferences';
import { DEFAULT_PREFERENCES } from '@typings/preferences.types';
import type { MonitoringPrefs } from '@typings/preferences.types';

export type MonitoringSettings = MonitoringPrefs;

export const MONITORING_DEFAULTS: MonitoringSettings = DEFAULT_PREFERENCES.monitoring;

/** Capa fina sobre PreferencesContext (persistido en la cuenta del usuario). */
export function useMonitoringSettings() {
	const { prefs, patch } = usePreferences();
	const settings = prefs.monitoring;

	const setSettings = useCallback((next: MonitoringSettings) => patch('monitoring', next), [patch]);
	const update = useCallback((p: Partial<MonitoringSettings>) => patch('monitoring', p), [patch]);

	return { settings, setSettings, update };
}
