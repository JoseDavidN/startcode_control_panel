import { useCallback, useRef } from 'react';
import { usePreferences } from '@hooks/usePreferences';
import type { SecurityPrefs } from '@typings/preferences.types';

export type SecuritySettings = SecurityPrefs;

/** Capa fina sobre PreferencesContext (persistido en la cuenta del usuario). */
export function useSecuritySettings() {
	const { prefs, patch } = usePreferences();
	const settings = prefs.security;

	const ref = useRef(settings);
	ref.current = settings;

	const setSettings = useCallback(
		(next: SecuritySettings | ((prev: SecuritySettings) => SecuritySettings)) => {
			patch('security', typeof next === 'function' ? next(ref.current) : next);
		},
		[patch]
	);

	return { settings, setSettings };
}

/** Cuántos días han pasado desde que se cambió la contraseña */
export function passwordAgeDays(passwordChangedAt: Date | string | null | undefined): number | null {
	if (!passwordChangedAt) return null;
	const changed = new Date(passwordChangedAt);
	if (isNaN(changed.getTime())) return null;
	return Math.floor((Date.now() - changed.getTime()) / (1000 * 60 * 60 * 24));
}
