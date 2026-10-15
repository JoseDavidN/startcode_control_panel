import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

/**
 * Copia con el portapapeles del propio webview: un textarea fuera de pantalla
 * y `execCommand('copy')`. Es síncrono, así que va dentro del gesto del
 * usuario (tecla o clic), que es lo que piden WebKitGTK, WKWebView y WebView2,
 * y escribe en el portapapeles nativo de la ventana. El del plugin (arboard)
 * en Linux con Wayland escribe en el de X11 y puede fallar o no llegar.
 * Devuelve el foco y la selección donde estaban.
 */
function copyWithWebview(text: string): boolean {
	const previous = document.activeElement as HTMLElement | null;
	const selection = window.getSelection();
	const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i)) : [];

	const area = document.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none';
	document.body.appendChild(area);
	area.select();
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch {
		ok = false;
	}
	area.remove();

	previous?.focus({ preventScroll: true });
	if (selection && ranges.length) {
		selection.removeAllRanges();
		ranges.forEach(r => selection.addRange(r));
	}
	return ok;
}

/**
 * Portapapeles del sistema. Primero el del webview (síncrono, dentro del
 * gesto); si no puede, el plugin de Tauri. Hay que llamarla directamente desde
 * el manejador de la tecla o el clic, sin un `await` antes.
 */
export function copyText(text: string): Promise<void> {
	if (copyWithWebview(text)) return Promise.resolve();
	return writeText(text);
}

export async function readClipboardText(): Promise<string> {
	return (await readText()) ?? '';
}
