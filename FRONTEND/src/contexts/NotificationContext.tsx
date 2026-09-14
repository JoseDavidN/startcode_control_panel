import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { notify } from '@services/notification.service';
import { useRealtimeMetrics } from '@contexts/RealtimeMetricsContext';
import { usePreferences } from '@contexts/PreferencesContext';

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

/* ── Watcher — dispara alertas al detectar umbrales o desconexión ─── */
function MetricWatcher({ prefs, thresholds }: { prefs: NotifPrefs; thresholds: NotifThresholds }) {
  const { data } = useRealtimeMetrics();
  /* Guardamos estado previo para detectar transiciones (online→offline, normal→alto) */
  const prevRef = useRef<Record<string, { status: string; cpu: number; memory: number; disk: number }>>({});

  useEffect(() => {
    Object.entries(data).forEach(([id, server]) => {
      const prev = prevRef.current[id];
      const name = server.serverName ?? `Servidor ${id.slice(0, 8)}`;
      const cpu    = server.metrics?.cpu    ?? 0;
      const memory = server.metrics?.memory ?? 0;
      const disk   = server.metrics?.disk   ?? 0;

      if (prev) {
        /* Servidor se desconectó */
        if (prefs.serverOffline && prev.status === 'online' && server.status === 'offline') {
          notify.error(`${name} desconectado`, 'El servidor dejó de responder al agente.');
        }

        /* CPU superó umbral */
        if (prefs.highCpuUsage && prev.cpu < thresholds.cpuThreshold && cpu >= thresholds.cpuThreshold) {
          notify.warning(`CPU alta en ${name}`, `Uso de CPU: ${Math.round(cpu)}% (umbral ${thresholds.cpuThreshold}%)`);
        }

        /* Memoria superó umbral */
        if (prefs.highMemoryUsage && prev.memory < thresholds.memoryThreshold && memory >= thresholds.memoryThreshold) {
          notify.warning(`Memoria alta en ${name}`, `Uso de RAM: ${Math.round(memory)}% (umbral ${thresholds.memoryThreshold}%)`);
        }

        /* Disco superó umbral */
        if (prefs.highDiskUsage && prev.disk < thresholds.diskThreshold && disk >= thresholds.diskThreshold) {
          notify.warning(`Disco crítico en ${name}`, `Uso de disco: ${Math.round(disk)}% (umbral ${thresholds.diskThreshold}%)`);
        }
      }

      prevRef.current[id] = { status: server.status, cpu, memory, disk };
    });
  }, [data, prefs, thresholds]);

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
      <MetricWatcher prefs={prefs} thresholds={thresholds} />
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
