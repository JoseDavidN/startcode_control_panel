import { useContext } from 'react';
import { NotificationContext, type NotificationContextType } from '@contexts/notification-context';

/* ── Hook ─────────────────────────────────────────────────────────── */
export const useNotifications = (): NotificationContextType => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications debe usarse dentro de NotificationProvider');
  return ctx;
};
