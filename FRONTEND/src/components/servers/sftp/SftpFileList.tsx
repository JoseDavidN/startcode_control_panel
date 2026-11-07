import React, { useState } from 'react';
import { MenuIcon } from '@components/common/ContextMenu';
import { useContextMenu } from '@hooks/useContextMenu';
import { formatSize } from '@services/sftp.service';
import { timeAgo } from '@utils/time';
import type { SftpEntry } from '@typings/sftp.types';
import { CheckIcon, DownloadIcon, FolderIcon, XIcon } from './icons';
import { SFTP_ROW_GRID, entryIcon, isNavigable } from './entry';

interface SftpFileListProps {
	entries: SftpEntry[];
	loading: boolean;
	error: string | null;
	creatingFolder: boolean;
	selected: string | null;
	onSelect: (entry: SftpEntry) => void;
	/** Casillas marcadas, por ruta. */
	checked: ReadonlySet<string>;
	onCheckedChange: (checked: Set<string>) => void;
	onDownload: (entries: SftpEntry[]) => void;
	/** Descargar la carpeta en la que se está; null en la raíz. */
	onDownloadCurrent: (() => void) | null;
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
	checked,
	onCheckedChange,
	onDownload,
	onDownloadCurrent,
	onNavigate,
	onCreateFolder,
	onCancelCreateFolder,
}) => {
	const [showHidden, setShowHidden] = useState(false);
	const [folderName, setFolderName] = useState('');
	const { openContextMenu } = useContextMenu();

	const visible = showHidden ? entries : entries.filter(e => !e.name.startsWith('.'));
	const hiddenCount = entries.length - visible.length;
	const folders = visible.filter(isNavigable).length;

	/* Lo que se descarga: lo marcado que esté a la vista o, si no hay, la fila elegida. */
	const marked = visible.filter(e => checked.has(e.path));
	const previewed = visible.find(e => e.path === selected);
	const targets = marked.length > 0 ? marked : previewed ? [previewed] : [];
	const allMarked = visible.length > 0 && marked.length === visible.length;

	const toggle = (path: string) => {
		const next = new Set(checked);
		if (!next.delete(path)) next.add(path);
		onCheckedChange(next);
	};

	const openMenu = (event: React.MouseEvent, entry: SftpEntry) => {
		/* Sobre una fila marcada actúa sobre todas las marcadas, como en un explorador. */
		const list = checked.has(entry.path) ? marked : [entry];
		openContextMenu(event, [
			...(isNavigable(entry)
				? [{ id: 'open', label: 'Abrir', icon: <MenuIcon name="open" />, onSelect: () => onNavigate(entry.path) }]
				: []),
			{
				id: 'download',
				label: list.length > 1 ? `Descargar ${list.length} elementos` : 'Descargar',
				icon: <MenuIcon name="download" />,
				onSelect: () => onDownload(list),
			},
		]);
	};

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
				<div className="flex-1" />
				{(targets.length > 0 || onDownloadCurrent) && (
					<button
						type="button"
						onClick={() => (targets.length > 0 ? onDownload(targets) : onDownloadCurrent?.())}
						title={targets.length === 1 ? targets[0].path : undefined}
						className="h-7 px-2.5 rounded-lg glass-soft row-hit text-[11px] font-medium text-white/80 hover:text-white
							flex items-center gap-1.5 transition shrink-0"
					>
						<DownloadIcon className="w-3.5 h-3.5" />
						{targets.length === 0 ? 'Descargar esta carpeta' : targets.length > 1 ? `Descargar (${targets.length})` : 'Descargar'}
					</button>
				)}
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
				<input
					type="checkbox"
					className="chk"
					aria-label="Marcar todo"
					checked={allMarked}
					disabled={visible.length === 0}
					onChange={() => onCheckedChange(new Set(allMarked ? [] : visible.map(e => e.path)))}
				/>
				<span />
				<span>Nombre</span>
				<span className="text-right">Tamaño</span>
				<span>Permisos</span>
				<span>Modificado</span>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
				{creatingFolder && (
					<div className={`${SFTP_ROW_GRID} h-10 border-b border-line bg-tint-sunken`}>
						<span />
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
									onContextMenu={e => openMenu(e, entry)}
									className={`${SFTP_ROW_GRID} h-9 border-b border-line last:border-0 cursor-pointer
										select-none transition ${isSelected ? 'bg-tint-active' : 'hover:bg-tint-hover'}`}
								>
									<input
										type="checkbox"
										className="chk"
										aria-label={`Marcar ${entry.name}`}
										checked={checked.has(entry.path)}
										onChange={() => toggle(entry.path)}
										onClick={e => e.stopPropagation()}
										onDoubleClick={e => e.stopPropagation()}
									/>
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
