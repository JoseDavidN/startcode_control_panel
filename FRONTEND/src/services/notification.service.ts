import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';

/* Notificación nativa del sistema operativo.

   Se llama a los comandos del plugin con `invoke`, no a las funciones de
   `@tauri-apps/plugin-notification`: esas pasan por `window.Notification` y
   dependen de que el script del plugin lo haya sustituido. Cuando no es así,
   acaba en la API web del webview: el permiso lo pide un aviso dentro de la
   app y la notificación no llega al sistema. Los permisos están en
   src-tauri/capabilities/default.json. */

/* macOS: el plugin usa NSUserNotificationCenter, que nunca pide permiso,
   dice que está concedido y el sistema descarta la notificación sin avisar.
   Ahí van los comandos propios (src-tauri/src/macos_notify.rs), con
   UNUserNotificationCenter y respaldo a osascript. Windows y Linux siguen con el plugin. */
const IS_MAC = /Mac/i.test(navigator.userAgent);

/** `granted`, `denied` o `default` (aún no se preguntó). */
export type NativePermission = 'granted' | 'denied' | 'default';

const invokeTauri = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => invoke<T>(cmd, args);

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
  if (IS_MAC) {
    /* Sin respuesta del comando (no debería pasar): «default», nunca el plugin. */
    return (await macPermission(request)) ?? 'default';
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

async function sendNativeTauri(title: string, body: string): Promise<boolean> {
  /* macOS nunca usa el plugin (NSUserNotificationCenter: el sistema descarta
     sin avisar). `macos_notify` pide el permiso si hace falta y, si el centro
     de notificaciones no se puede usar (sin firma, sin bundle en desarrollo o
     una entrega rechazada), entrega con osascript. Solo falla si el usuario
     denegó el permiso. */
  if (IS_MAC) {
    try {
      await invokeTauri('macos_notify', { title, body });
      return true;
    } catch (error) {
      console.warn('Notificación de macOS no entregada:', error);
      return false;
    }
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

/* ── Toast: los colores salen del tema (`.toaster-themed` en App.css) ── */
const BASE = { duration: 5000 };

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
    void sendNativeTauri(title, body).then(sent => { if (!sent) fallback(); });
  },
} as const;
