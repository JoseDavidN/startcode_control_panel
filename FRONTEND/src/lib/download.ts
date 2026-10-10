/** Descarga un Blob con el nombre dado (navegador y webview de la app). */
export function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	/* Revocar en el mismo tick puede cortar la descarga en algunos webviews. */
	setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
