import { toast } from 'sonner';

/* Intenta cargar el plugin nativo de Tauri, silenciando el fallo en navegador */
let _sendNative: ((opts: { title: string; body: string; icon?: string }) => void) | null = null;

(async () => {
  try {
    const mod = await import('@tauri-apps/plugin-notification');
    _sendNative = (opts) => mod.sendNotification({ title: opts.title, body: opts.body });
  } catch {
    /* no estamos en Tauri */
  }
})();

/* ── Toast styles compartidos ─────────────────────────────────────── */
const BASE = {
  style: {
    background: 'rgba(8,3,20,0.92)',
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(28px)',
    color: '#f4f1ff',
  } as React.CSSProperties,
  duration: 5000,
};

/* ── API pública ──────────────────────────────────────────────────── */
export const notify = {
  success: (title: string, desc?: string) =>
    toast.success(title, { ...BASE, description: desc }),

  error: (title: string, desc?: string) =>
    toast.error(title, { ...BASE, description: desc }),

  warning: (title: string, desc?: string) =>
    toast.warning(title, { ...BASE, description: desc, duration: 7000 }),

  info: (title: string, desc?: string) =>
    toast.info(title, { ...BASE, description: desc }),

  /* Notificación nativa del SO — funciona fuera del foco de la app.
     Para alertas de seguridad. También muestra toast interno como respaldo. */
  native: (title: string, body: string) => {
    if (_sendNative) {
      _sendNative({ title, body });
    } else {
      /* Fallback Web Notification API (dev browser) */
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification(title, { body });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => {
            if (p === 'granted') new Notification(title, { body });
          });
        }
      }
    }
    /* Siempre muestra toast interno también */
    toast.error(title, { ...BASE, description: body, duration: 9000 });
  },
} as const;
