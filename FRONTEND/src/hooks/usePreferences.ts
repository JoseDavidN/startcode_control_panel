import { useContext } from 'react';
import { PreferencesContext, type PreferencesContextValue } from '@contexts/preferences-context';

export const usePreferences = (): PreferencesContextValue => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences debe usarse dentro de PreferencesProvider');
  return ctx;
};
