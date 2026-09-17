import { pickedFromFile, type FilePickerProvider, type PickedFile } from './filePicker';

/** Abre un selector nativo y resuelve con lo que el usuario elija. */
function openInput(directory: boolean): Promise<PickedFile[]> {
	return new Promise(resolve => {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.style.display = 'none';

		if (directory) {
			// `webkitdirectory` no está en los tipos de TS pero lo soportan
			// Chromium, Firefox y WebKit.
			input.setAttribute('webkitdirectory', '');
			input.setAttribute('directory', '');
		}

		const finish = (files: PickedFile[]) => {
			input.remove();
			resolve(files);
		};

		input.addEventListener('change', () => {
			finish(Array.from(input.files ?? []).map(file => pickedFromFile(file)));
		});
		// Cancelar el diálogo no dispara `change`; sin esto la promesa
		// quedaría viva para siempre.
		input.addEventListener('cancel', () => finish([]));

		document.body.appendChild(input);
		input.click();
	});
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

async function walk(entry: FsEntry, prefix: string): Promise<PickedFile[]> {
	if (entry.isFile) {
		const file = await fileOf(entry);
		return file ? [pickedFromFile(file, `${prefix}${entry.name}`)] : [];
	}

	if (!entry.isDirectory) return [];

	const children = await readAllEntries(entry);
	const nested = await Promise.all(
		children.map(child => walk(child, `${prefix}${entry.name}/`)),
	);
	return nested.flat();
}

export const webFilePicker: FilePickerProvider = {
	id: 'web',
	canPickDirectory: true,

	pickFiles: () => openInput(false),
	pickDirectory: () => openInput(true),

	async fromDropEvent(event) {
		const transfer = event.dataTransfer;
		if (!transfer) return [];

		/* Los items hay que tomarlos ANTES de cualquier await: el
		   `DataTransfer` se vacía en cuanto termina el handler. */
		const entries: FsEntry[] = [];
		const items = Array.from(transfer.items ?? []);
		for (const item of items) {
			const asEntry = (item as DataTransferItem & {
				webkitGetAsEntry?: () => FsEntry | null;
			}).webkitGetAsEntry?.();
			if (asEntry) entries.push(asEntry);
		}

		if (entries.length === 0) {
			// Sin API de entradas no hay carpetas, pero los archivos sueltos sí.
			return Array.from(transfer.files ?? []).map(file => pickedFromFile(file));
		}

		const picked = await Promise.all(entries.map(entry => walk(entry, '')));
		return picked.flat();
	},
};
