import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

/**
 * Guarda un Blob con el diálogo nativo de «Guardar como» y lo escribe con el
 * plugin `fs` (la ruta elegida entra sola en su alcance). Devuelve la ruta,
 * o null si el usuario canceló.
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<string | null> {
	const ext = /\.(\w+)$/.exec(fileName)?.[1];
	const path = await save({
		defaultPath: fileName,
		filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
	});
	if (!path) return null;
	await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
	return path;
}
