import { toast } from 'sonner';
import { IS_TAURI } from '@lib/tauriStore';

/* Notificación nativa del sistema operativo.

   Se llama a los comandos del plugin con `invoke`, no a las funciones de
   `@tauri-apps/plugin-notification`: esas pasan por `window.Notification` y
   dependen de que el script del plugin lo haya sustituido. Cuando no es así,
   acaba en la API web del webview: el permiso lo pide un aviso dentro de la
   app y la notificación no llega al sistema.

   El gate es IS_TAURI, no un try/catch alrededor del import: Vite resuelve el
   módulo también en el navegador. Los permisos están en
   src-tauri/capabilities/default.json. */

/* macOS: el plugin usa NSUserNotificationCenter, que nunca pide permiso,
   dice que está concedido y el sistema descarta la notificación sin avisar.
   Ahí van los comandos propios (src-tauri/src/macos_notify.rs), con
   UNUserNotificationCenter. Fallan sin bundle (`tauri dev`): entonces, el plugin. */
const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

/** `granted`, `denied` o `default` (aún no se preguntó). */
export type NativePermission = 'granted' | 'denied' | 'default';

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

async function macPermission(request: boolean): Promise<NativePermission | null> {
  try {
    return await invokeTauri<NativePermission>('macos_notification_permission', { request });
  } catch (error) {
    console.warn('Permiso de notificaciones de macOS no disponible:', error);
    return null;
  }
}

/** Estado del permiso del sistema; con `request` se pide si aún no se preguntó. */
export async function nativePermission(request = false): Promise<NativePermission> {
  if (IS_TAURI) {
    if (IS_MAC) {
      const mac = await macPermission(request);
      if (mac) return mac;
    }
    try {
      let granted = await invokeTauri<boolean | null>('plugin:notification|is_permission_granted');
      if (!granted && request) {
        granted = (await invokeTauri<string>('plugin:notification|request_permission')) === 'granted';
      }
      return granted ? 'granted' : request ? 'denied' : 'default';
    } catch {
      return 'denied';
    }
  }
  if (typeof Notification === 'undefined') return 'denied';
  if (request && Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

async function sendNativeTauri(title: string, body: string): Promise<boolean> {
  if (IS_MAC) {
    const permission = await macPermission(true);
    if (permission === 'denied') return false;
    if (permission === 'granted') {
      try {
        await invokeTauri('macos_notify', { title, body });
        return true;
      } catch (error) {
        console.warn('Notificación de macOS no entregada:', error);
        return false;
      }
    }
    /* null: sin bundle (desarrollo); se intenta con el plugin. */
  }
  try {
    let granted = await invokeTauri<boolean | null>('plugin:notification|is_permission_granted');
    if (!granted) {
      granted = (await invokeTauri<string>('plugin:notification|request_permission')) === 'granted';
    }
    if (!granted) return false;
    await invokeTauri('plugin:notification|notify', { options: { title, body } });
    return true;
  } catch (error) {
    console.warn('Notificación del sistema no disponible:', error);
    return false;
  }
}

/** Navegador: `false` si no se puede mostrar (sin API o permiso denegado). */
function sendNativeWeb(title: string, body: string): boolean {
  if (typeof Notification === 'undefined' || Notification.permission === 'denied') return false;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
    return true;
  }
  void Notification.requestPermission().then(p => {
    if (p === 'granted') new Notification(title, { body });
    else toast.error(title, { ...BASE, description: body, duration: 9000 });
  });
  return true;
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

  /* Aviso con un botón de acción; se queda hasta que se pulsa o se cierra. */
  action: (title: string, desc: string, label: string, onClick: () => void) =>
    toast.info(title, { ...BASE, description: desc, duration: Infinity, closeButton: true, action: { label, onClick } }),

  /* Notificación nativa del SO — funciona fuera del foco de la app. Para
     alertas de seguridad. El toast interno solo sale si el sistema no la
     entregó (sin permiso o sin servicio de notificaciones): así la alerta
     nunca se pierde, pero tampoco aparece dos veces. */
  native: (title: string, body: string) => {
    const fallback = () =>
      toast.error(title, { ...BASE, description: `${body}\n(No se pudo mostrar como notificación del sistema.)`, duration: 9000 });
    if (IS_TAURI) {
      void sendNativeTauri(title, body).then(sent => { if (!sent) fallback(); });
    } else {
      if (!sendNativeWeb(title, body)) fallback();
    }
  },
} as const;
