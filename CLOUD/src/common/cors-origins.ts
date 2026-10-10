/**
 * Orígenes permitidos por CORS (copia de la regla de BACKEND).
 *
 * CORS_ORIGIN admite `*` o una lista separada por comas. Se añaden siempre
 * los orígenes de la app de escritorio (Tauri): el webview compilado carga
 * desde un esquema propio, distinto según el sistema.
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
