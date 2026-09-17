import React, { useState } from 'react';
import { formatSize } from '@services/sftp.service';
import { timeAgo } from '@utils/time';
import type { SftpEntry } from '@typings/sftp.types';
import { CheckIcon, FileIcon, FolderIcon, LinkIcon, XIcon } from './icons';

interface SftpFileListProps {
	entries: SftpEntry[];
	loading: boolean;
	error: string | null;
	creatingFolder: boolean;
	onNavigate: (path: string) => void;
	onCreateFolder: (name: string) => void;
	onCancelCreateFolder: () => void;
}

const entryIcon = (entry: SftpEntry) => {
	if (entry.type === 'dir' || entry.linkType === 'dir')
		return <FolderIcon className="w-4 h-4 text-violet-300" />;
	if (entry.type === 'symlink') return <LinkIcon className="w-4 h-4 text-sky-300" />;
	return <FileIcon className="w-4 h-4 text-white/45" />;
};

const isNavigable = (entry: SftpEntry) =>
	entry.type === 'dir' || entry.linkType === 'dir';

export const SftpFileList: React.FC<SftpFileListProps> = ({
	entries,
	loading,
	error,
	creatingFolder,
	onNavigate,
	onCreateFolder,
	onCancelCreateFolder,
}) => {
	const [showHidden, setShowHidden] = useState(false);
	const [folderName, setFolderName] = useState('');

	const visible = showHidden ? entries : entries.filter(e => !e.name.startsWith('.'));
	const hiddenCount = entries.length - visible.length;

	const confirmFolder = () => {
		const name = folderName.trim();
		if (!name) return onCancelCreateFolder();
		onCreateFolder(name);
		setFolderName('');
	};

	return (
		<div className="glass-soft rounded-xl border border-white/[0.06] overflow-hidden">
			{/* Cabecera de columnas */}
			<div className="flex items-center gap-3 px-3 h-9 border-b border-white/[0.06]
				text-[10px] font-semibold uppercase tracking-wider text-white/40">
				<span className="flex-1">Nombre</span>
				<span className="w-20 text-right">Tamaño</span>
				<span className="w-24 hidden sm:block">Permisos</span>
				<span className="w-24 hidden md:block">Modificado</span>
				<button
					type="button"
					onClick={() => setShowHidden(v => !v)}
					className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition ${
						showHidden
							? 'grad-brand-soft text-white'
							: 'text-white/45 hover:text-white hover:bg-white/[0.06]'
					}`}
					title={hiddenCount > 0 ? `${hiddenCount} elementos ocultos` : 'Mostrar ocultos'}
				>
					Ocultos
				</button>
			</div>

			<div className="max-h-[34vh] overflow-y-auto scroll-thin">
				{creatingFolder && (
					<div className="flex items-center gap-3 px-3 h-11 border-b border-white/[0.05] bg-white/[0.03]">
						<FolderIcon className="w-4 h-4 text-violet-300 shrink-0" />
						<input
							autoFocus
							value={folderName}
							onChange={e => setFolderName(e.target.value)}
							onKeyDown={e => {
								if (e.key === 'Enter') confirmFolder();
								if (e.key === 'Escape') {
									setFolderName('');
									onCancelCreateFolder();
								}
							}}
							placeholder="Nombre de la carpeta"
							className="flex-1 bg-transparent outline-none text-sm font-mono text-white/90
								placeholder:text-white/30"
						/>
						<button
							type="button"
							onClick={confirmFolder}
							title="Crear"
							className="w-7 h-7 rounded-lg glass text-emerald-300 flex items-center justify-center"
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
							className="w-7 h-7 rounded-lg glass text-white/50 flex items-center justify-center"
						>
							<XIcon className="w-3.5 h-3.5" />
						</button>
					</div>
				)}

				{error ? (
					<p className="px-3 py-8 text-center text-sm text-rose-300">{error}</p>
				) : loading ? (
					<p className="px-3 py-8 text-center text-sm text-white/45">Leyendo el directorio…</p>
				) : visible.length === 0 ? (
					<p className="px-3 py-8 text-center text-sm text-white/45">
						{hiddenCount > 0 ? 'Solo hay elementos ocultos' : 'Directorio vacío'}
					</p>
				) : (
					visible.map(entry => (
						<div
							key={entry.path}
							onDoubleClick={() => isNavigable(entry) && onNavigate(entry.path)}
							className={`flex items-center gap-3 px-3 h-10 border-b border-white/[0.04] last:border-0
								transition ${isNavigable(entry) ? 'cursor-pointer hover:bg-white/[0.05]' : ''}`}
						>
							<span className="shrink-0">{entryIcon(entry)}</span>
							<button
								type="button"
								onClick={() => isNavigable(entry) && onNavigate(entry.path)}
								disabled={!isNavigable(entry)}
								title={entry.name}
								className={`flex-1 min-w-0 text-left text-sm truncate ${
									isNavigable(entry) ? 'text-white' : 'text-white/70 cursor-default'
								}`}
							>
								{entry.name}
								{entry.linkType === 'broken' && (
									<span className="ml-2 text-xs text-rose-300">enlace roto</span>
								)}
							</button>
							<span className="w-20 text-right text-xs font-mono tabular-nums text-white/55">
								{entry.type === 'dir' ? '—' : formatSize(entry.size)}
							</span>
							<span className="w-24 hidden sm:block text-xs font-mono text-white/45">
								{entry.permissions}
							</span>
							<span className="w-24 hidden md:block text-xs text-white/45 truncate">
								{entry.mtime ? timeAgo(new Date(entry.mtime)) : '—'}
							</span>
						</div>
					))
				)}
			</div>
		</div>
	);
};
