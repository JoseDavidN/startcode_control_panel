/**
 * Selección de archivos y carpetas, con una sola interfaz para el navegador y
 * para la app de escritorio.
 *
 * En Tauri v2 el webview se queda con el *drop* del sistema operativo y los
 * eventos HTML no reciben archivos; por eso la ventana declara
 * `dragDropEnabled: false` en `tauri.conf.json`. Con eso, el mismo camino web
 * —objetos `File`, que el navegador transmite desde disco sin cargarlos en
 * memoria— funciona en los dos sitios para soltar.
 *
 * Para *elegir*, la app de escritorio usa el diálogo nativo del sistema
 * (`filePicker.tauri.ts`, plugins `dialog` y `fs`); el navegador, el
 * `<input type="file">`.
 */

import { IS_TAURI } from '@lib/tauriStore';

export interface PickedFile {
	/** Ruta POSIX relativa a la raíz de la selección: "dist/assets/app.js" */
	relPath: string;
	name: string;
	size: number;
	blob(): Promise<Blob>;
}

export interface FilePickerProvider {
	readonly id: 'web' | 'tauri';
	readonly canPickDirectory: boolean;
	pickFiles(): Promise<PickedFile[]>;
	pickDirectory(): Promise<PickedFile[]>;
	fromDropEvent(event: React.DragEvent): Promise<PickedFile[]>;
}

let provider: FilePickerProvider | null = null;

export async function getFilePicker(): Promise<FilePickerProvider> {
	if (provider) return provider;

	if (IS_TAURI) {
		const { tauriFilePicker } = await import('./filePicker.tauri');
		provider = tauriFilePicker;
	} else {
		const { webFilePicker } = await import('./filePicker.web');
		provider = webFilePicker;
	}
	return provider;
}

/** Envuelve un `File` del navegador conservando su ruta dentro de la carpeta. */
export function pickedFromFile(file: File, relPath?: string): PickedFile {
	return {
		relPath: relPath || file.webkitRelativePath || file.name,
		name: file.name,
		size: file.size,
		blob: () => Promise.resolve(file),
	};
}
