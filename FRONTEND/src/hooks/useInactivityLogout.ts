import { useEffect, useRef, useCallback } from 'react';

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;

/**
 * Cierra sesión automáticamente tras `minutes` minutos de inactividad.
 * Pasa 0 para deshabilitar.
 */
export function useInactivityLogout(minutes: number, onLogout: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logout = useCallback(onLogout, [onLogout]);

  useEffect(() => {
    if (!minutes || minutes <= 0) return;

    const ms = minutes * 60 * 1000;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logout, ms);
    };

    reset();
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      EVENTS.forEach(e => window.removeEventListener(e, reset));
    };
  }, [minutes, logout]);
}
