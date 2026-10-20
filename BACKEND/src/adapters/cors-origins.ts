/**
 * Orígenes permitidos por CORS, compartidos por HTTP y Socket.IO.
 *
 * CORS_ORIGIN admite una lista separada por comas (`*` solo fuera de producción):
 *   CORS_ORIGIN=http://localhost:5173,https://panel.example.com
 *
 * A la lista se añaden siempre los orígenes de la app de escritorio (Tauri):
 * el webview compilado no carga desde un dominio sino desde un esquema propio,
 * distinto según el sistema, y sin ellos el instalable no podría hablar con el
 * backend aunque el navegador sí.
 */
export const TAURI_ORIGINS = [
  'tauri://localhost', // macOS y Linux
  'http://tauri.localhost', // Windows (por defecto en Tauri 2)
  'https://tauri.localhost', // Windows con useHttpsScheme
];

/** Servidor de Vite de la app en desarrollo (`tauri dev` carga desde aquí). */
export const DEV_ORIGINS = ['http://localhost:5173'];

/**
 * En producción `*` no se admite: cualquier web podría llamar a la API desde
 * el navegador de un usuario. Se ignora con un aviso y quedan solo los
 * orígenes configurados más los de Tauri. En desarrollo se respeta `*` (el
 * servidor de Vite se abre por nombre de equipo o IP de la red).
 */
export function resolveCorsOrigins(
  raw = process.env.CORS_ORIGIN ?? '',
  nodeEnv = process.env.NODE_ENV,
): '*' | string[] {
  const production = nodeEnv === 'production';
  const wildcard = raw.split(',').some(origin => origin.trim() === '*');

  if (wildcard && !production) return '*';
  if (wildcard) {
    console.warn('[CORS] CORS_ORIGIN=* no se admite en producción: se ignora.');
  }

  const configured = raw
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(origin => origin && origin !== '*');

  return [
    ...new Set([...configured, ...TAURI_ORIGINS, ...(nodeEnv === 'development' ? DEV_ORIGINS : [])]),
  ];
}
