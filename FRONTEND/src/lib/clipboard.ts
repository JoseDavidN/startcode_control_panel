/**
 * Copiar texto al portapapeles en el navegador y en la app de escritorio.
 *
 * `navigator.clipboard` solo existe en contexto seguro (HTTPS o localhost):
 * con el panel servido por http desde otra máquina, o en algunos webviews,
 * no está o rechaza la escritura. En ese caso se copia con un textarea
 * temporal y `execCommand('copy')`, que funciona mientras la llamada venga
 * de un gesto del usuario (clic o tecla).
 */
export async function copyText(text: string): Promise<void> {
	if (window.isSecureContext && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			/* Permiso denegado o webview sin soporte: se intenta el respaldo. */
		}
	}
	copyWithTextarea(text);
}

function copyWithTextarea(text: string): void {
	const active = document.activeElement as HTMLElement | null;
	const area = document.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	/* Fuera de la vista pero seleccionable (display:none no deja seleccionar). */
	area.style.position = 'fixed';
	area.style.top = '0';
	area.style.left = '-9999px';
	area.style.opacity = '0';
	document.body.appendChild(area);
	area.select();
	area.setSelectionRange(0, text.length);
	let ok = false;
	try {
		/* Obsoleto, pero es el único camino fuera de contexto seguro. */
		ok = document.execCommand('copy');
	} finally {
		area.remove();
		/* Devolver el foco: el atajo Ctrl+C se pulsó sobre la tabla. */
		active?.focus?.({ preventScroll: true });
	}
	if (!ok) throw new Error('El navegador no permitió copiar al portapapeles');
}
