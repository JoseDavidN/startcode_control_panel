/**
 * Orígenes permitidos por CORS, compartidos por HTTP y Socket.IO.
 *
 * CORS_ORIGIN admite `*` o una lista separada por comas:
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

export function resolveCorsOrigins(raw = process.env.CORS_ORIGIN ?? '*'): '*' | string[] {
  if (raw.trim() === '*') return '*';

  const configured = raw
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return [...new Set([...configured, ...TAURI_ORIGINS])];
}
