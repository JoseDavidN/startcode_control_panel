import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';

/* Notificación nativa del sistema operativo.

   Se llama a los comandos del plugin con `invoke`, no a las funciones de
   `@tauri-apps/plugin-notification`: esas pasan por `window.Notification` y
   dependen de que el script del plugin lo haya sustituido. Cuando no es así,
   acaba en la API web del webview: el permiso lo pide un aviso dentro de la
   app y la notificación no llega al sistema. Los permisos están en
   src-tauri/capabilities/default.json. */

/* macOS: en la app empaquetada, los comandos propios
   (src-tauri/src/macos_notify.rs) con UNUserNotificationCenter, que pide el
   permiso con el diálogo del sistema. Si no se puede usar (en desarrollo no
   hay bundle; o el sistema no deja a la app pedir permiso), el comando
   responde `UNAVAILABLE:` y se usa el plugin, la vía oficial de Tauri: en
   desarrollo publica como Terminal, así que llega si Terminal tiene las
   notificaciones permitidas en Ajustes del Sistema → Notificaciones.
   Windows y Linux usan siempre el plugin. */
export const IS_MAC = /Mac/i.test(navigator.userAgent);

/** `granted`, `denied` o `default` (aún no se preguntó). */
export type NativePermission = 'granted' | 'denied' | 'default';

const invokeTauri = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => invoke<T>(cmd, args);

const unavailable = (error: unknown) => String(error).startsWith('UNAVAILABLE:');

/** Permiso con UNUserNotificationCenter; null si no se puede usar (se usa el plugin). */
async function macPermission(request: boolean): Promise<NativePermission | null> {
  try {
    return await invokeTauri<NativePermission>('macos_notification_permission', { request });
  } catch (error) {
    if (!unavailable(error)) console.warn('Permiso de notificaciones de macOS:', error);
    return null;
  }
}

async function sendWithPlugin(title: string, body: string): Promise<boolean> {
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

/** Estado del permiso del sistema; con `request` se pide si aún no se preguntó. */
export async function nativePermission(request = false): Promise<NativePermission> {
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

async function sendNativeTauri(title: string, body: string): Promise<boolean> {
  if (IS_MAC) {
    try {
      await invokeTauri('macos_notify', { title, body });
      return true;
    } catch (error) {
      /* Permiso denegado por el usuario: se respeta. Sin centro disponible: el plugin. */
      if (!unavailable(error)) {
        console.warn('Notificación de macOS no entregada:', error);
        return false;
      }
    }
  }
  return sendWithPlugin(title, body);
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
