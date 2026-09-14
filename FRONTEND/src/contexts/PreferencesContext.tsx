import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { apiService } from '@services/api.service';
import { queryClient } from '@lib/queryClient';
import { API_CONFIG } from '@utils/constants';
import { TokenManager } from '@utils/tokenManager';
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  prefersReducedMotion,
  sanitizeSection,
} from '@typings/preferences.types';
import type { PreferenceSection, UserPreferences } from '@typings/preferences.types';

/* ── Caché local ──────────────────────────────────────────────────────
   Una sola clave. `userId` evita que los ajustes de una cuenta se
   atribuyan a otra; `dirty` marca cambios locales aún sin confirmar. */
const KEY = 'startcode:prefs';
const LEGACY = {
  appearance: 'startcode:appearance',
  security: 'startcode:security',
  monitoring: 'startcode:monitoring',
  notifications: 'startcode:notif-prefs',
} as const;

interface PrefsCache {
  userId: string | null;
  prefs: UserPreferences;
  dirty: boolean;
}

function readJson(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function writeCache(cache: PrefsCache): void {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage bloqueado */ }
}

/**
 * Lee la caché unificada; si no existe, migra las cuatro claves antiguas.
 * Síncrono e idempotente: corre en el inicializador de useState para que el
 * primer render ya tenga el aspecto correcto (sin parpadeo de 240→70 px).
 */
function loadCacheOrMigrate(): PrefsCache {
  const cached = readJson(KEY);
  if (cached && typeof cached === 'object' && cached.prefs) {
    return {
      userId: typeof cached.userId === 'string' ? cached.userId : null,
      prefs: mergePreferences(cached.prefs as Partial<UserPreferences>, {}),
      dirty: cached.dirty === true,
    };
  }

  const legacy = {
    appearance: readJson(LEGACY.appearance),
    security: readJson(LEGACY.security),
    monitoring: readJson(LEGACY.monitoring),
    notifications: readJson(LEGACY.notifications),
  };
  const hadLegacy = Object.values(legacy).some(o => o && Object.keys(o).length > 0);

  const prefs = mergePreferences(DEFAULT_PREFERENCES, {
    appearance: {
      sidebarMode: legacy.appearance?.sidebarMode === 'collapsed' ? 'collapsed' : 'expanded',
      reducedMotion:
        typeof legacy.appearance?.reducedMotion === 'boolean'
          ? legacy.appearance.reducedMotion
          : prefersReducedMotion(),
    },
    security: (legacy.security ?? undefined) as never,
    monitoring: (legacy.monitoring ?? undefined) as never,
    notifications: (legacy.notifications ?? undefined) as never,
  });

  /* dirty ⇒ el primer hydrate sube estos valores al servidor.
     Las claves antiguas NO se borran: permiten volver atrás sin perder nada. */
  const cache: PrefsCache = { userId: null, prefs, dirty: hadLegacy };
  writeCache(cache);
  return cache;
}

/* ── Contexto ─────────────────────────────────────────────────────── */
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

interface PreferencesContextValue {
  prefs: UserPreferences;
  status: SyncStatus;
  patch: <K extends PreferenceSection>(section: K, value: Partial<UserPreferences[K]>) => void;
  flush: () => Promise<void>;
  /** API interna — solo la consume PreferencesSync */
  hydrate: (serverPrefs: Partial<UserPreferences> | null, userId: string) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  const initial = useRef<PrefsCache>(loadCacheOrMigrate());
  const [prefs, setPrefs] = useState<UserPreferences>(initial.current.prefs);
  const [status, setStatus] = useState<SyncStatus>('local');

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const ownerId = useRef<string | null>(initial.current.userId);
  const pending = useRef<Partial<UserPreferences>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  /* ── Push ───────────────────────────────────────────────────────── */
  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }

    const body = pending.current;
    if (!Object.keys(body).length) return;
    if (!TokenManager.getAccessToken()) return;   // sin sesión: queda en caché con dirty

    if (inFlight.current) {                        // un PATCH como máximo en vuelo
      await inFlight.current;
      return flush();
    }

    pending.current = {};
    setStatus('syncing');

    inFlight.current = (async () => {
      try {
        const res = await apiService.patch<UserPreferences>(API_CONFIG.ENDPOINTS.PREFERENCES, body);
        const merged = mergePreferences((res as unknown as Partial<UserPreferences>) ?? {}, {});
        /* No aplicamos la respuesta al estado: el valor local es la verdad durante la
           sesión y así no rebota si el usuario sigue moviendo un slider. */
        writeCache({ userId: ownerId.current, prefs: prefsRef.current, dirty: false });
        /* Coherencia con la caché de React Query SIN refetch: invalidar dispararía
           un /auth/me por cada cambio y podría pisar el valor local. */
        queryClient.setQueryData(['currentUser'], (old: unknown) =>
          old ? { ...(old as object), preferences: merged } : old,
        );
        setStatus('synced');
      } catch {
        pending.current = { ...body, ...pending.current };   // reencolar para el próximo intento
        writeCache({ userId: ownerId.current, prefs: prefsRef.current, dirty: true });
        setStatus('error');
      } finally {
        inFlight.current = null;
      }
    })();

    return inFlight.current;
  }, []);

  const schedulePush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 600);
  }, [flush]);

  /* ── Cambios locales ────────────────────────────────────────────── */
  const patch = useCallback(<K extends PreferenceSection>(section: K, value: Partial<UserPreferences[K]>) => {
    const clean = sanitizeSection(section, value);
    if (!Object.keys(clean).length) return;

    setPrefs(prev => {
      const next = { ...prev, [section]: { ...prev[section], ...clean } };
      writeCache({ userId: ownerId.current, prefs: next, dirty: true });
      return next;
    });

    pending.current = {
      ...pending.current,
      [section]: { ...(pending.current[section] ?? {}), ...clean },
    };
    schedulePush();
  }, [schedulePush]);

  /* ── Sincronización con el servidor ─────────────────────────────── */
  const pushAll = useCallback((all: UserPreferences) => {
    pending.current = {
      appearance: all.appearance,
      notifications: all.notifications,
      security: all.security,
      monitoring: all.monitoring,
    };
    void flush();
  }, [flush]);

  const hydrate = useCallback((serverPrefs: Partial<UserPreferences> | null, userId: string) => {
    const cache = loadCacheOrMigrate();
    const sameOwner = cache.userId === null || cache.userId === userId;
    ownerId.current = userId;

    if (!serverPrefs) {
      /* Nunca configuró nada en el servidor: conservamos lo de este equipo
         (salvo que la caché fuera de otra cuenta) y hacemos el primer push. */
      const local = sameOwner ? prefsRef.current : DEFAULT_PREFERENCES;
      prefsRef.current = local;   // el push usa la ref: adelantarla evita escribir la caché del usuario anterior
      setPrefs(local);
      writeCache({ userId, prefs: local, dirty: true });
      pushAll(local);
      return;
    }

    const merged = mergePreferences(serverPrefs, {});
    prefsRef.current = merged;
    setPrefs(merged);                 // en la hidratación manda el servidor
    writeCache({ userId, prefs: merged, dirty: false });
    pending.current = {};             // descarta la cola de la sesión anterior
    setStatus('synced');

    /* Había ediciones locales sin confirmar de este mismo usuario (offline) */
    if (sameOwner && cache.dirty) pushAll(cache.prefs);
  }, [pushAll]);

  const reset = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    pending.current = {};
    ownerId.current = null;
    setStatus('local');
    /* Conservamos los valores (son los de este equipo) pero sin dueño */
    writeCache({ userId: null, prefs: prefsRef.current, dirty: false });
  }, []);

  /* ── Efectos ────────────────────────────────────────────────────── */
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = prefs.appearance.reducedMotion ? 'true' : 'false';
  }, [prefs.appearance.reducedMotion]);

  /* Otras ventanas/pestañas: aplicamos lo recibido sin reenviarlo */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== KEY) return;   // key === null ⇒ localStorage.clear()
      const cache = loadCacheOrMigrate();
      setPrefs(cache.prefs);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /* Último cambio antes de cerrar o navegar */
  useEffect(() => {
    const onUnload = () => { void flush(); };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void flush();
    };
  }, [flush]);

  const value = useMemo<PreferencesContextValue>(
    () => ({ prefs, status, patch, flush, hydrate, reset }),
    [prefs, status, patch, flush, hydrate, reset],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = (): PreferencesContextValue => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences debe usarse dentro de PreferencesProvider');
  return ctx;
};
