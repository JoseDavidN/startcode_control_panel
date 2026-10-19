import { useEffect, useRef } from 'react';
import { useAuth } from '@hooks/useAuth';
import { usePreferences } from '@hooks/usePreferences';

/**
 * Puente entre la sesión y las preferencias. Va montado DENTRO de AuthProvider
 * (el provider de preferencias está por encima y no puede usar useAuth), igual
 * que InactivityWatcher.
 */
export const PreferencesSync = () => {
  const { user, isAuthenticated } = useAuth();
  const { hydrate, reset, flush } = usePreferences();

  /* Ref, no estado: sobrevive al doble montaje de StrictMode */
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      if (hydratedFor.current) { hydratedFor.current = null; reset(); }
      return;
    }
    if (hydratedFor.current === user.id) return;   // ya hidratado en esta sesión
    hydratedFor.current = user.id;
    hydrate(user.preferences ?? null, user.id);
  }, [isAuthenticated, user, hydrate, reset]);

  /* Reintento al recuperar la conexión */
  useEffect(() => {
    const onOnline = () => { void flush(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

  return null;
};
