import { createContext } from 'react';
import type { NativePermission } from '@services/notification.service';

/* Tipos y contexto de notificaciones, aparte del proveedor
   (NotificationContext.tsx) para que ese archivo solo exporte componentes. */

/* ── Tipos ────────────────────────────────────────────────────────── */
export interface NotifPrefs {
  serverOffline: boolean;
  highCpuUsage: boolean;
  highMemoryUsage: boolean;
  highDiskUsage: boolean;
  weeklyReport: boolean;
  productNews: boolean;
}

export interface NotifThresholds {
  cpuThreshold: number;
  memoryThreshold: number;
  diskThreshold: number;
}

export interface NotificationContextType {
  prefs: NotifPrefs;
  setPrefs: (p: NotifPrefs) => void;
  thresholds: NotifThresholds;
  setThresholds: (t: NotifThresholds) => void;
  testToast: (type: keyof NotifPrefs) => void;
  testNative: () => void;
  /** Alertas de seguridad como notificación del sistema. Se guarda en este
      equipo, no en la cuenta: el permiso y el soporte cambian con el sistema. */
  securityAlerts: boolean;
  setSecurityAlerts: (on: boolean) => void;
  /** Permiso del sistema operativo para notificar; null mientras se consulta. */
  permission: NativePermission | null;
  requestPermission: () => Promise<NativePermission>;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
