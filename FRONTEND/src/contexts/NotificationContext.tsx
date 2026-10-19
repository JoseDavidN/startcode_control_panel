import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notify, nativePermission, type NativePermission } from '@services/notification.service';
import { storeGet, storeSet } from '@lib/tauriStore';
import { STORAGE_KEYS } from '@utils/constants';
import { notificationsApi } from '@services/notifications.api';
import { useRealtimeSocket } from '@hooks/useRealtimeMetrics';
import { useAuth } from '@hooks/useAuth';
import { usePreferences } from '@hooks/usePreferences';
import {
  NotificationContext,
  type NotifPrefs,
  type NotifThresholds,
} from '@contexts/notification-context';
import type { AppNotification } from '@typings/notification.types';

/* ── Puente con el backend ────────────────────────────────────────────
   La detección de umbrales y de servidor caído vive en el servidor: es el
   único sitio donde la alerta existe aunque nadie tenga la app abierta, y
   evita duplicados con varias sesiones. Aquí solo se escucha la señal
   `notifications:changed` (sin payload, el namespace es broadcast), se
   recarga la lista con el JWT propio y se avisa de lo que sea nuevo. */
function ServerAlertBridge({ securityAlerts }: { securityAlerts: boolean }) {
  const { socket } = useRealtimeSocket();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  /* Ids ya anunciados: al arrancar se siembran con el pendiente para no
     soltar de golpe los toasts del historial. */
  const announced = useRef<Set<string> | null>(null);
  const securityRef = useRef(securityAlerts);
  securityRef.current = securityAlerts;

  const announce = useCallback((items: AppNotification[]) => {
    const seen = announced.current;
    if (!seen) return;
    /* Del más antiguo al más reciente para que el orden en pantalla coincida */
    [...items].reverse().forEach(item => {
      if (seen.has(item.id)) return;
      seen.add(item.id);

      if (item.type === 'security' && securityRef.current) {
        notify.native(item.title, item.body);
        return;
      }
      if (item.severity === 'error') notify.error(item.title, item.body);
      else if (item.severity === 'warning') notify.warning(item.title, item.body);
      else notify.info(item.title, item.body);
    });
  }, []);

  /* Siembra inicial: lo que ya estaba sin leer no se anuncia.
     Sin sesión no se pide nada: el 401 dispararía la redirección dura del
     interceptor y la pantalla de login se recargaría en bucle. */
  useEffect(() => {
    if (!isAuthenticated) {
      announced.current = null;
      return;
    }

    let cancelled = false;
    notificationsApi
      .list({ unread: true, limit: 50 })
      .then(res => {
        if (cancelled) return;
        announced.current = new Set(res.items.map(i => i.id));
      })
      .catch(() => {
        if (!cancelled) announced.current = new Set();
      });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    const onChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      notificationsApi
        .list({ unread: true, limit: 20 })
        .then(res => announce(res.items))
        .catch(() => { /* sin sesión o backend caído: el toast se pierde, la fila no */ });
    };

    socket.on('notifications:changed', onChanged);
    return () => { socket.off('notifications:changed', onChanged); };
  }, [socket, isAuthenticated, queryClient, announce]);

  return null;
}

/* ── Provider ─────────────────────────────────────────────────────── */
export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  /* Las preferencias viven en la cuenta del usuario: aquí solo se derivan */
  const { prefs: all, patch } = usePreferences();
  const prefs = all.notifications;

  const thresholds = useMemo<NotifThresholds>(() => ({
    cpuThreshold:    all.monitoring.cpuThreshold,
    memoryThreshold: all.monitoring.memoryThreshold,
    diskThreshold:   all.monitoring.diskThreshold,
  }), [all.monitoring]);

  const setPrefs      = useCallback((p: NotifPrefs)      => patch('notifications', p), [patch]);

  /* Locales del equipo: activado por defecto hasta que se guarde otra cosa. */
  const [securityAlerts, setSecurityAlertsState] = useState(true);
  const [permission, setPermission] = useState<NativePermission | null>(null);

  useEffect(() => {
    void storeGet<boolean>(STORAGE_KEYS.NATIVE_SECURITY_ALERTS)
      .then(saved => { if (typeof saved === 'boolean') setSecurityAlertsState(saved); })
      .catch(() => undefined);
    void nativePermission(false).then(setPermission);
  }, []);

  const setSecurityAlerts = useCallback((on: boolean) => {
    setSecurityAlertsState(on);
    void storeSet(STORAGE_KEYS.NATIVE_SECURITY_ALERTS, on).catch(() => undefined);
  }, []);

  const requestPermission = useCallback(async () => {
    const next = await nativePermission(true);
    setPermission(next);
    return next;
  }, []);
  const setThresholds = useCallback((t: NotifThresholds) => patch('monitoring', t),    [patch]);

  const testToast = (type: keyof NotifPrefs) => {
    switch (type) {
      case 'serverOffline':
        notify.error('prod-server-01 desconectado', 'El servidor dejó de responder al agente.');
        break;
      case 'highCpuUsage':
        notify.warning('CPU alta en prod-server-01', `Uso de CPU: ${thresholds.cpuThreshold + 5}% (umbral ${thresholds.cpuThreshold}%)`);
        break;
      case 'highMemoryUsage':
        notify.warning('Memoria alta en prod-server-01', `Uso de RAM: ${thresholds.memoryThreshold + 3}% (umbral ${thresholds.memoryThreshold}%)`);
        break;
      case 'highDiskUsage':
        notify.warning('Disco crítico en prod-server-01', `Uso de disco: ${thresholds.diskThreshold + 2}% (umbral ${thresholds.diskThreshold}%)`);
        break;
      case 'weeklyReport':
        notify.info('Reporte semanal listo', 'El resumen de actividad de la semana está disponible.');
        break;
      case 'productNews':
        /* La versión sale de tauri.conf.json (vite.config.ts), no se escribe aquí. */
        notify.info('Nueva versión disponible', `StartCode Panel v${import.meta.env.VITE_APP_VERSION ?? ''} ya está lista para actualizar.`);
        break;
      default:
        notify.info('Notificación de prueba', 'El sistema de notificaciones funciona correctamente.');
    }
  };

  /* Primero el permiso (la primera vez abre el diálogo del sistema) y luego la prueba. */
  const testNative = () => {
    void requestPermission().then(() => notify.native(
      'Alerta de seguridad — StartCode',
      'Se detectó un intento de acceso no autorizado en prod-server-01 desde 203.0.113.45.',
    ));
  };

  return (
    <NotificationContext.Provider value={{
      prefs, setPrefs, thresholds, setThresholds, testToast, testNative,
      securityAlerts, setSecurityAlerts, permission, requestPermission,
    }}>
      <ServerAlertBridge securityAlerts={securityAlerts} />
      {children}
    </NotificationContext.Provider>
  );
};
