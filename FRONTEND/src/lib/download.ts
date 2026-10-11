import { IS_TAURI } from '@lib/tauriStore';

/**
 * Guarda un Blob con el nombre dado. Devuelve dónde quedó (la ruta en la app
 * de escritorio, el nombre en el navegador) o null si el usuario canceló.
 *
 * El webview de la app ignora `<a download>`: ahí se abre el diálogo nativo
 * de «Guardar como» y se escribe con el plugin `fs` (la ruta elegida entra
 * sola en el alcance del plugin).
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<string | null> {
	if (IS_TAURI) {
		const [{ save }, { writeFile }] = await Promise.all([
			import('@tauri-apps/plugin-dialog'),
			import('@tauri-apps/plugin-fs'),
		]);
		const ext = /\.([\w]+)$/.exec(fileName)?.[1];
		const path = await save({
			defaultPath: fileName,
			filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
		});
		if (!path) return null;
		await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
		return path;
	}

	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	/* Revocar en el mismo tick puede cortar la descarga en algunos webviews. */
	setTimeout(() => URL.revokeObjectURL(url), 1_000);
	return fileName;
}
