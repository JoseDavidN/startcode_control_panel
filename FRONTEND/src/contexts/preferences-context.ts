import { createContext } from 'react';
import type { PreferenceSection, UserPreferences } from '@typings/preferences.types';

/* Tipos y contexto de preferencias, aparte del proveedor
   (PreferencesContext.tsx) para que ese archivo solo exporte componentes. */

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

export interface PreferencesContextValue {
  prefs: UserPreferences;
  status: SyncStatus;
  patch: <K extends PreferenceSection>(section: K, value: Partial<UserPreferences[K]>) => void;
  flush: () => Promise<void>;
  /** API interna — solo la consume PreferencesSync */
  hydrate: (serverPrefs: Partial<UserPreferences> | null, userId: string) => void;
  reset: () => void;
}

export const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);
