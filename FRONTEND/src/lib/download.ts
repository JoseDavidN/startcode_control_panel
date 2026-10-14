import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

/**
 * Diálogo nativo de «Guardar como». Se abre antes de descargar nada: así
 * aparece al instante aunque el archivo sea grande. Devuelve la ruta, o null
 * si el usuario canceló.
 */
export function pickSavePath(fileName: string): Promise<string | null> {
	const ext = /\.(\w+)$/.exec(fileName)?.[1];
	return save({
		defaultPath: fileName,
		filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
	});
}

/**
 * Guarda un Blob con el diálogo nativo de «Guardar como» y lo escribe con el
 * plugin `fs` (la ruta elegida entra sola en su alcance). Devuelve la ruta,
 * o null si el usuario canceló.
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<string | null> {
	const path = await pickSavePath(fileName);
	if (!path) return null;
	await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
	return path;
}
