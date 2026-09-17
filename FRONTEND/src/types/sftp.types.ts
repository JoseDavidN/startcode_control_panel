export type SftpEntryType = 'dir' | 'file' | 'symlink' | 'other';

/** Una entrada del directorio remoto, tal y como la manda el backend. */
export interface SftpEntry {
	name: string;
	path: string;
	type: SftpEntryType;
	/** Destino de un enlace simbólico, cuando se pudo resolver */
	linkType?: SftpEntryType | 'broken';
	size: number;
	mode: number;
	permissions: string;
	/** Epoch en milisegundos */
	mtime: number;
	uid: number;
	gid: number;
}

export interface SftpListing {
	path: string;
	entries: SftpEntry[];
}

export interface SftpReady {
	sessionId: string;
	serverName: string;
	user: string;
	host: string;
	home: string;
	cwd: string;
	entries: SftpEntry[];
}

export type SftpStatus = 'idle' | 'connecting' | 'ready' | 'error' | 'closed';

export type UploadStatus =
	| 'queued'
	| 'uploading'
	| 'done'
	| 'error'
	| 'canceled'
	| 'conflict';

export interface UploadItem {
	id: string;
	/** Ruta relativa al destino: es lo que conserva el árbol de una carpeta */
	relPath: string;
	name: string;
	size: number;
	loaded: number;
	status: UploadStatus;
	error?: string;
	/** Destino congelado al encolar: la cola sobrevive a cambios de directorio */
	destDir: string;
}
