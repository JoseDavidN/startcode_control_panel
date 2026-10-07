import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@services/notification.service';
import { notificationsApi } from '@services/notifications.api';
import { useRealtimeSocket } from '@contexts/RealtimeMetricsContext';
import { useAuth } from '@hooks/useAuth';
import { usePreferences } from '@contexts/PreferencesContext';
import type { AppNotification } from '@typings/notification.types';

/* ── Tipos ────────────────────────────────────────────────────────── */
export interface NotifPrefs {
  serverOffline: boolean;
  highCpuUsage: boolean;
  highMemoryUsage: boolean;
  highDiskUsage: boolean;
  securityAlerts: boolean;
  weeklyReport: boolean;
  productNews: boolean;
}

export interface NotifThresholds {
  cpuThreshold: number;
  memoryThreshold: number;
  diskThreshold: number;
}

interface NotificationContextType {
  prefs: NotifPrefs;
  setPrefs: (p: NotifPrefs) => void;
  thresholds: NotifThresholds;
  setThresholds: (t: NotifThresholds) => void;
  testToast: (type: keyof NotifPrefs) => void;
  testNative: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

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
        notify.info('Nueva versión disponible', 'StartCode Panel v0.2.0 ya está lista para actualizar.');
        break;
      default:
        notify.info('Notificación de prueba', 'El sistema de notificaciones funciona correctamente.');
    }
  };

  const testNative = () => {
    notify.native(
      'Alerta de seguridad — StartCode',
      'Se detectó un intento de acceso no autorizado en prod-server-01 desde 203.0.113.45.',
    );
  };

  return (
    <NotificationContext.Provider value={{ prefs, setPrefs, thresholds, setThresholds, testToast, testNative }}>
      <ServerAlertBridge securityAlerts={prefs.securityAlerts} />
      {children}
    </NotificationContext.Provider>
  );
};

/* ── Hook ─────────────────────────────────────────────────────────── */
export const useNotifications = (): NotificationContextType => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications debe usarse dentro de NotificationProvider');
  return ctx;
};
