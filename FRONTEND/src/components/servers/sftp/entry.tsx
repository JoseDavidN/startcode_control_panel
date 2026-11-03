import type { SftpEntry } from '@typings/sftp.types';
import { FileIcon, FolderIcon, LinkIcon } from './icons';

/* Una sola plantilla para cabecera y filas: icono, nombre, tamaño, permisos y
   fecha caen siempre en la misma columna. */
export const SFTP_ROW_GRID = 'grid grid-cols-[16px_minmax(0,1fr)_80px_96px_104px] items-center gap-3 px-3';

export const entryIcon = (entry: SftpEntry, size = 'w-4 h-4') => {
	if (entry.type === 'dir' || entry.linkType === 'dir')
		return <FolderIcon className={`${size} text-violet-300`} />;
	if (entry.type === 'symlink') return <LinkIcon className={`${size} text-sky-300`} />;
	return <FileIcon className={`${size} text-white/45`} />;
};

export const isNavigable = (entry: SftpEntry) =>
	entry.type === 'dir' || entry.linkType === 'dir';
