import { join } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { stat, writeFile } from '@tauri-apps/plugin-fs';

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

/** Carpeta de destino para varias descargas; entra entera en el alcance de `fs`. */
export async function pickSaveFolder(): Promise<string | null> {
	const selected = await open({ multiple: false, directory: true, recursive: true, title: 'Elegir carpeta de destino' });
	return typeof selected === 'string' ? selected : null;
}

/* eslint-disable-next-line no-control-regex */
const UNSAFE_NAME = /[/\\:*?"<>|\x00-\x1f\x7f]/g;
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

/**
 * Nombre que viene de otro sistema, seguro para el disco local. En Linux un
 * archivo puede llamarse `..\..\x` o `a:b`, y en Windows eso sale de la carpeta
 * elegida o no se puede crear.
 */
export function safeFileName(name: string): string {
	const clean = name.replace(UNSAFE_NAME, '_').replace(/[. ]+$/, '');
	if (!clean) return 'descarga';
	return RESERVED_NAME.test(clean) ? `_${clean}` : clean;
}

/** `dir/nombre` sin pisar nada: si existe (o ya se usó en este lote), «nombre (1).ext». */
export async function freePath(dir: string, name: string, taken: Set<string>): Promise<string> {
	const dot = name.lastIndexOf('.');
	const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
	for (let n = 0; ; n++) {
		const candidate = await join(dir, n === 0 ? name : `${base} (${n})${ext}`);
		if (taken.has(candidate)) continue;
		const exists = await stat(candidate).then(() => true, () => false);
		if (!exists) {
			taken.add(candidate);
			return candidate;
		}
	}
}
