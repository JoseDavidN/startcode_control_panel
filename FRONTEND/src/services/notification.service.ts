import { toast } from 'sonner';
import { IS_TAURI } from '@lib/tauriStore';

/* Notificación nativa del sistema operativo.

   El gate es IS_TAURI, no un try/catch alrededor del import: Vite resuelve el
   módulo del plugin también en el navegador, así que el catch no saltaba nunca
   y el respaldo web quedaba inalcanzable. Los permisos ya están declarados en
   src-tauri/capabilities/default.json, pero hay que pedirlos igualmente. */
async function sendNativeTauri(title: string, body: string): Promise<boolean> {
  try {
    const mod = await import('@tauri-apps/plugin-notification');
    let granted = await mod.isPermissionGranted();
    if (!granted) granted = (await mod.requestPermission()) === 'granted';
    if (!granted) return false;
    mod.sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}

function sendNativeWeb(title: string, body: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
    return;
  }
  if (Notification.permission !== 'denied') {
    void Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body });
    });
  }
}

/* ── Toast styles compartidos ─────────────────────────────────────── */
const BASE = {
  style: {
    background: 'rgb(var(--surface-rgb) / 0.92)',
    border: '1px solid var(--hairline)',
    backdropFilter: 'blur(28px)',
    color: 'var(--ink)',
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
    if (IS_TAURI) {
      void sendNativeTauri(title, body).then(sent => {
        if (!sent) sendNativeWeb(title, body);
      });
    } else {
      sendNativeWeb(title, body);
    }
    /* Siempre muestra toast interno también */
    toast.error(title, { ...BASE, description: body, duration: 9000 });
  },
} as const;
