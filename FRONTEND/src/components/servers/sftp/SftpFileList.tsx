import React, { useState } from 'react';
import { formatSize } from '@services/sftp.service';
import { timeAgo } from '@utils/time';
import type { SftpEntry } from '@typings/sftp.types';
import { CheckIcon, FolderIcon, XIcon } from './icons';
import { SFTP_ROW_GRID, entryIcon, isNavigable } from './entry';

interface SftpFileListProps {
	entries: SftpEntry[];
	loading: boolean;
	error: string | null;
	creatingFolder: boolean;
	selected: string | null;
	onSelect: (entry: SftpEntry) => void;
	onNavigate: (path: string) => void;
	onCreateFolder: (name: string) => void;
	onCancelCreateFolder: () => void;
}

export const SftpFileList: React.FC<SftpFileListProps> = ({
	entries,
	loading,
	error,
	creatingFolder,
	selected,
	onSelect,
	onNavigate,
	onCreateFolder,
	onCancelCreateFolder,
}) => {
	const [showHidden, setShowHidden] = useState(false);
	const [folderName, setFolderName] = useState('');

	const visible = showHidden ? entries : entries.filter(e => !e.name.startsWith('.'));
	const hiddenCount = entries.length - visible.length;
	const folders = visible.filter(isNavigable).length;

	const confirmFolder = () => {
		const name = folderName.trim();
		if (!name) return onCancelCreateFolder();
		onCreateFolder(name);
		setFolderName('');
	};

	return (
		<div className="glass-soft rounded-xl overflow-hidden h-full min-h-0 flex flex-col">
			{/* Resumen y filtro, fuera de la rejilla de columnas */}
			<div className="flex items-center justify-between gap-3 px-3 h-10 border-b border-line shrink-0">
				<span className="text-xs text-white/50 tabular-nums truncate">
					{loading
						? 'Leyendo…'
						: `${folders} ${folders === 1 ? 'carpeta' : 'carpetas'} · ${visible.length - folders} ${
								visible.length - folders === 1 ? 'archivo' : 'archivos'
							}`}
				</span>
				<button
					type="button"
					onClick={() => setShowHidden(v => !v)}
					className={`px-2.5 h-6 rounded-full text-[11px] font-medium transition shrink-0 ${
						showHidden
							? 'grad-brand-soft text-white'
							: 'text-white/50 hover:text-white hover:bg-tint-hover'
					}`}
					title={hiddenCount > 0 ? `${hiddenCount} elementos ocultos` : 'Mostrar ocultos'}
				>
					{showHidden ? 'Ocultar ocultos' : `Mostrar ocultos${hiddenCount > 0 ? ` (${hiddenCount})` : ''}`}
				</button>
			</div>

			{/* Cabecera de columnas */}
			<div className={`${SFTP_ROW_GRID} h-8 border-b border-line shrink-0
				text-[10px] font-semibold uppercase tracking-wider text-white/40`}>
				<span />
				<span>Nombre</span>
				<span className="text-right">Tamaño</span>
				<span>Permisos</span>
				<span>Modificado</span>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
				{creatingFolder && (
					<div className={`${SFTP_ROW_GRID} h-10 border-b border-line bg-tint-sunken`}>
						<FolderIcon className="w-4 h-4 text-violet-300" />
						<div className="col-span-4 flex items-center gap-2 min-w-0">
							<input
								autoFocus
								value={folderName}
								onChange={e => setFolderName(e.target.value)}
								onKeyDown={e => {
									if (e.key === 'Enter') confirmFolder();
									if (e.key === 'Escape') {
										e.stopPropagation();
										e.nativeEvent.stopImmediatePropagation();
										setFolderName('');
										onCancelCreateFolder();
									}
								}}
								placeholder="Nombre de la carpeta"
								className="flex-1 min-w-0 bg-transparent outline-none text-sm font-mono text-white/90
									placeholder:text-white/30"
							/>
							<button
								type="button"
								onClick={confirmFolder}
								title="Crear"
								className="w-7 h-7 shrink-0 rounded-lg glass text-emerald-300 flex items-center justify-center"
							>
								<CheckIcon className="w-3.5 h-3.5" />
							</button>
							<button
								type="button"
								onClick={() => {
									setFolderName('');
									onCancelCreateFolder();
								}}
								title="Cancelar"
								className="w-7 h-7 shrink-0 rounded-lg glass text-white/50 flex items-center justify-center"
							>
								<XIcon className="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				)}

				{error ? (
					<p className="px-3 py-10 text-center text-sm text-rose-300">{error}</p>
				) : loading && entries.length === 0 ? (
					<p className="px-3 py-10 text-center text-sm text-white/45">Leyendo el directorio…</p>
				) : visible.length === 0 ? (
					<p className="px-3 py-10 text-center text-sm text-white/45">
						{hiddenCount > 0 ? 'Solo hay elementos ocultos' : 'Directorio vacío'}
					</p>
				) : (
					<div className={`transition-opacity ${loading ? 'opacity-50' : ''}`}>
						{visible.map(entry => {
							const nav = isNavigable(entry);
							const isSelected = selected === entry.path;
							return (
								<div
									key={entry.path}
									role="row"
									aria-selected={isSelected}
									title={nav ? 'Clic: vista previa · Doble clic: abrir' : entry.name}
									onClick={() => onSelect(entry)}
									onDoubleClick={() => nav && onNavigate(entry.path)}
									className={`${SFTP_ROW_GRID} h-9 border-b border-line last:border-0 cursor-pointer
										select-none transition ${isSelected ? 'bg-tint-active' : 'hover:bg-tint-hover'}`}
								>
									<span className="flex">{entryIcon(entry)}</span>
									<span
										className={`min-w-0 truncate text-sm ${
											nav ? 'text-white' : 'text-white/70'
										}`}
									>
										{entry.name}
										{entry.linkType === 'broken' && (
											<span className="ml-2 text-xs text-rose-300">enlace roto</span>
										)}
									</span>
									<span className="text-right text-xs font-mono tabular-nums text-white/55 truncate">
										{nav ? '—' : formatSize(entry.size)}
									</span>
									<span className="text-xs font-mono text-white/45 truncate">
										{entry.permissions}
									</span>
									<span className="text-xs text-white/45 truncate">
										{entry.mtime ? timeAgo(new Date(entry.mtime)) : '—'}
									</span>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};
