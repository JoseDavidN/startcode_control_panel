import { open } from '@tauri-apps/plugin-dialog';
import { open as openFile, readDir, readFile, SeekMode, stat } from '@tauri-apps/plugin-fs';
import { basename, join } from '@tauri-apps/api/path';

/**
 * Selección de archivos y carpetas en la app de escritorio.
 *
 * Elegir: el diálogo nativo del sistema (plugin `dialog`) y el contenido se
 * lee con el plugin `fs`. Lo que se elige entra en el ámbito de `fs` (las
 * carpetas, con sus subcarpetas: `recursive`), así que no hace falta abrir
 * permisos de lectura a todo el disco. El contenido se lee al pedirlo
 * (`blob()`), no al elegir: una carpeta grande no carga nada en memoria hasta
 * que se sube cada archivo.
 *
 * Soltar: la ventana declara `dragDropEnabled: false` en `tauri.conf.json`,
 * así el soltar del sistema llega al webview como eventos HTML con objetos
 * `File`, que se transmiten desde disco sin cargarlos en memoria.
 *
 * Al cargar una carpeta se omiten las de paquetes y cachés (`node_modules`,
 * entornos virtuales de Python…): miles de archivos que se regeneran con el
 * gestor de paquetes. Si se elige o se suelta una de ellas directamente, sí
 * se carga.
 */

export interface PickedFile {
	/** Ruta POSIX relativa a la raíz de la selección: "dist/assets/app.js" */
	relPath: string;
	name: string;
	size: number;
	blob(): Promise<Blob>;
	/** Bytes [start, end): para subir por partes sin cargar el archivo entero. Sin él, se parte `blob()`. */
	slice?(start: number, end: number): Promise<Blob>;
}

/** Lo elegido o soltado, y las carpetas de paquetes que se dejaron fuera (ruta relativa). */
export interface PickResult {
	files: PickedFile[];
	skipped: string[];
}

/* Carpetas de dependencias y cachés que no se suben. Un entorno virtual de
   Python con otro nombre se reconoce por su `pyvenv.cfg`. */
const PACKAGE_DIRS = new Set([
	'node_modules', 'bower_components', 'jspm_packages', '.pnpm-store',
	'venv', '.venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox',
	'.gradle',
]);
const isPackageDir = (name: string, children: string[]) =>
	PACKAGE_DIRS.has(name) || children.includes('pyvenv.cfg');

const merge = (parts: PickResult[]): PickResult => ({
	files: parts.flatMap(p => p.files),
	skipped: parts.flatMap(p => p.skipped),
});

async function pickedFromPath(path: string, relPath: string): Promise<PickedFile> {
	const info = await stat(path);
	return {
		relPath,
		name: relPath.split('/').pop() ?? relPath,
		size: info.size,
		blob: async () => new Blob([await readFile(path)]),
		slice: (start, end) => readRange(path, start, end),
	};
}

/**
 * Lee solo un tramo del archivo. `readFile` lo cargaría entero en memoria (y
 * lo pasaría entero por IPC): con varios archivos grandes a la vez, la app se
 * quedaba sin memoria y la subida se caía.
 */
async function readRange(path: string, start: number, end: number): Promise<Blob> {
	const handle = await openFile(path, { read: true });
	try {
		await handle.seek(start, SeekMode.Start);
		const buffer = new Uint8Array(end - start);
		let filled = 0;
		/* `read` puede devolver menos de lo pedido: se repite hasta llenar. */
		while (filled < buffer.length) {
			const n = await handle.read(buffer.subarray(filled));
			if (!n) break;
			filled += n;
		}
		return new Blob([filled === buffer.length ? buffer : buffer.subarray(0, filled)]);
	} finally {
		await handle.close();
	}
}

/** Todos los archivos bajo `dir`, con su ruta relativa a la carpeta elegida. `root`: la elegida, que nunca se omite. */
async function walk(dir: string, prefix: string, root = false): Promise<PickResult> {
	const entries = await readDir(dir);
	if (!root && isPackageDir(prefix.split('/').pop() ?? '', entries.filter(e => e.isFile).map(e => e.name))) {
		return { files: [], skipped: [prefix] };
	}
	const nested = await Promise.all(entries.map(async (entry): Promise<PickResult> => {
		const path = await join(dir, entry.name);
		const rel = `${prefix}/${entry.name}`;
		/* Los enlaces simbólicos se saltan: pueden salir del ámbito o hacer ciclos. */
		if (entry.isSymlink) return { files: [], skipped: [] };
		if (entry.isDirectory) return walk(path, rel);
		return { files: entry.isFile ? [await pickedFromPath(path, rel)] : [], skipped: [] };
	}));
	return merge(nested);
}

export async function pickFiles(): Promise<PickResult> {
	const selected = await open({ multiple: true, directory: false, title: 'Elegir archivos' });
	if (!selected) return { files: [], skipped: [] };
	const paths = Array.isArray(selected) ? selected : [selected];
	return { files: await Promise.all(paths.map(async path => pickedFromPath(path, await basename(path)))), skipped: [] };
}

export async function pickDirectory(): Promise<PickResult> {
	const selected = await open({ multiple: false, directory: true, recursive: true, title: 'Elegir carpeta' });
	if (!selected || Array.isArray(selected)) return { files: [], skipped: [] };
	return walk(selected, await basename(selected), true);
}

/** Envuelve un `File` soltado conservando su ruta dentro de la carpeta. */
function pickedFromFile(file: File, relPath?: string): PickedFile {
	return {
		relPath: relPath || file.webkitRelativePath || file.name,
		name: file.name,
		size: file.size,
		blob: () => Promise.resolve(file),
		slice: (start, end) => Promise.resolve(file.slice(start, end)),
	};
}

/* ── Recorrido de carpetas soltadas ───────────────────────────────── */

interface FsEntry {
	isFile: boolean;
	isDirectory: boolean;
	name: string;
	fullPath: string;
	file?: (cb: (file: File) => void, err: (e: unknown) => void) => void;
	createReader?: () => {
		readEntries: (cb: (entries: FsEntry[]) => void, err: (e: unknown) => void) => void;
	};
}

const fileOf = (entry: FsEntry): Promise<File | null> =>
	new Promise(resolve => {
		entry.file?.(
			file => resolve(file),
			() => resolve(null),
		);
	});

/**
 * Lee un directorio entero. `readEntries` devuelve lotes (Chromium corta en
 * 100): hay que llamarlo en bucle hasta que devuelva vacío o se pierden
 * archivos sin que nada avise.
 */
async function readAllEntries(entry: FsEntry): Promise<FsEntry[]> {
	const reader = entry.createReader?.();
	if (!reader) return [];

	const all: FsEntry[] = [];
	for (;;) {
		const batch = await new Promise<FsEntry[]>(resolve => {
			reader.readEntries(
				entries => resolve(entries),
				() => resolve([]),
			);
		});
		if (batch.length === 0) break;
		all.push(...batch);
	}
	return all;
}

async function walkEntry(entry: FsEntry, prefix: string, root = false): Promise<PickResult> {
	if (entry.isFile) {
		const file = await fileOf(entry);
		return { files: file ? [pickedFromFile(file, `${prefix}${entry.name}`)] : [], skipped: [] };
	}

	if (!entry.isDirectory) return { files: [], skipped: [] };

	const children = await readAllEntries(entry);
	if (!root && isPackageDir(entry.name, children.filter(c => c.isFile).map(c => c.name))) {
		return { files: [], skipped: [`${prefix}${entry.name}`] };
	}
	const nested = await Promise.all(
		children.map(child => walkEntry(child, `${prefix}${entry.name}/`)),
	);
	return merge(nested);
}

/**
 * Archivos y carpetas soltados. Llamarla dentro del manejador del `drop`,
 * sin ningún `await` antes: el `DataTransfer` se vacía en cuanto termina.
 */
export function filesFromDrop(event: React.DragEvent): Promise<PickResult> {
	const transfer = event.dataTransfer;
	if (!transfer) return Promise.resolve({ files: [], skipped: [] });

	/* Los items se toman ya, antes de cualquier await. */
	const entries: FsEntry[] = [];
	for (const item of Array.from(transfer.items ?? [])) {
		const asEntry = (item as DataTransferItem & {
			webkitGetAsEntry?: () => FsEntry | null;
		}).webkitGetAsEntry?.();
		if (asEntry) entries.push(asEntry);
	}
	if (entries.length === 0) {
		return Promise.resolve({ files: Array.from(transfer.files ?? []).map(file => pickedFromFile(file)), skipped: [] });
	}
	/* Lo soltado directamente cuenta como elegido: no se omite aunque sea de paquetes. */
	return Promise.all(entries.map(entry => walkEntry(entry, '', true))).then(merge);
}

/** «Se omitieron node_modules y 2 más (carpetas de paquetes).» para avisar al usuario; null si no se omitió nada. */
export function describeSkipped(skipped: string[]): string | null {
	if (skipped.length === 0) return null;
	const names = [...new Set(skipped.map(p => p.split('/').pop() ?? p))];
	const shown = names.slice(0, 3).join(', ');
	const more = names.length > 3 ? ` y ${names.length - 3} más` : '';
	return `No se cargaron ${skipped.length === 1 ? 'una carpeta' : `${skipped.length} carpetas`} de paquetes o cachés (${shown}${more}): se regeneran con el gestor de paquetes.`;
}
