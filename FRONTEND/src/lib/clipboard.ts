import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

/**
 * Portapapeles del sistema con el plugin de Tauri: no depende de que el
 * webview dé permiso a `navigator.clipboard` (WebKitGTK lo niega o pregunta).
 */
export function copyText(text: string): Promise<void> {
	return writeText(text);
}

export async function readClipboardText(): Promise<string> {
	return (await readText()) ?? '';
}
