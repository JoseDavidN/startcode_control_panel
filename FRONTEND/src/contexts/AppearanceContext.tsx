import { useMemo } from 'react';
import { usePreferences } from '@contexts/PreferencesContext';
import type { AppearancePrefs, ServersView, SidebarMode } from '@typings/preferences.types';

export type { SidebarMode, ServersView };
export type AppearanceSettings = AppearancePrefs;

/**
 * Capa fina sobre PreferencesContext: el estado y la persistencia viven allí.
 * Se conserva este módulo para no cambiar los imports de AppLayout y Settings.
 */
export const useAppearance = () => {
  const { prefs, patch } = usePreferences();
  const appearance = prefs.appearance;

  return useMemo(
    () => ({
      ...appearance,
      isSidebarCollapsed: appearance.sidebarMode === 'collapsed',
      setSidebarMode: (sidebarMode: SidebarMode) => patch('appearance', { sidebarMode }),
      setReducedMotion: (reducedMotion: boolean) => patch('appearance', { reducedMotion }),
      setServersView: (serversView: ServersView) => patch('appearance', { serversView }),
    }),
    [appearance, patch],
  );
};
