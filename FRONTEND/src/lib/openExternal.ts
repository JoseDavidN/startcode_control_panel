import { openUrl } from '@tauri-apps/plugin-opener';

/** true si `url` es una dirección http(s) absoluta: lo único que se abre fuera de la app. */
export function isExternalHttpUrl(url: string | null | undefined): url is string {
	if (!url) return false;
	try {
		const { protocol } = new URL(url);
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Abre `url` en el navegador del sistema (plugin `opener`). Solo http y https:
 * los enlaces vienen de Markdown de la nube o de la salida de un servidor, y
 * otros esquemas (`file:`, `javascript:`, manejadores de apps) no se abren.
 * El ámbito del plugin en `capabilities/default.json` aplica la misma regla.
 */
export async function openExternalUrl(url: string): Promise<void> {
	if (!isExternalHttpUrl(url)) throw new Error('Solo se abren enlaces http o https');
	await openUrl(url);
}
