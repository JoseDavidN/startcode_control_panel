import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, stat } from '@tauri-apps/plugin-fs';
import { basename, join } from '@tauri-apps/api/path';
import { webFilePicker } from './filePicker.web';
import type { FilePickerProvider, PickedFile } from './filePicker';

/**
 * Selector de la app de escritorio: el diálogo nativo del sistema (plugin
 * `dialog`) en vez del `<input type="file">` del webview, y el contenido se
 * lee con el plugin `fs`. Lo que se elige en el diálogo entra en el ámbito
 * de `fs` (las carpetas, con sus subcarpetas: `recursive`), así que no hace
 * falta abrir permisos de lectura a todo el disco.
 *
 * El contenido se lee al pedirlo (`blob()`), no al elegir: elegir una
 * carpeta grande no carga nada en memoria hasta que se sube cada archivo.
 */

async function pickedFromPath(path: string, relPath: string): Promise<PickedFile> {
	const info = await stat(path);
	return {
		relPath,
		name: relPath.split('/').pop() ?? relPath,
		size: info.size,
		blob: async () => new Blob([await readFile(path)]),
	};
}

/** Todos los archivos bajo `dir`, con su ruta relativa a la carpeta elegida. */
async function walk(dir: string, prefix: string): Promise<PickedFile[]> {
	const entries = await readDir(dir);
	const nested = await Promise.all(entries.map(async entry => {
		const path = await join(dir, entry.name);
		const rel = `${prefix}/${entry.name}`;
		/* Los enlaces simbólicos se saltan: pueden salir del ámbito o hacer ciclos. */
		if (entry.isSymlink) return [];
		if (entry.isDirectory) return walk(path, rel);
		return entry.isFile ? [await pickedFromPath(path, rel)] : [];
	}));
	return nested.flat();
}

export const tauriFilePicker: FilePickerProvider = {
	id: 'tauri',
	canPickDirectory: true,

	async pickFiles() {
		const selected = await open({ multiple: true, directory: false, title: 'Elegir archivos' });
		if (!selected) return [];
		const paths = Array.isArray(selected) ? selected : [selected];
		return Promise.all(paths.map(async path => pickedFromPath(path, await basename(path))));
	},

	async pickDirectory() {
		const selected = await open({ multiple: false, directory: true, recursive: true, title: 'Elegir carpeta' });
		if (!selected || Array.isArray(selected)) return [];
		return walk(selected, await basename(selected));
	},

	/* Con `dragDropEnabled: false` el soltar llega al webview como en el navegador. */
	fromDropEvent: event => webFilePicker.fromDropEvent(event),
};
