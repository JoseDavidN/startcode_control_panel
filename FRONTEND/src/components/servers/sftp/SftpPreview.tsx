import React, { useEffect, useState } from 'react';
import { formatSize } from '@services/sftp.service';
import { timeAgo } from '@utils/time';
import type { SftpEntry, SftpListing } from '@typings/sftp.types';
import { entryIcon, isNavigable } from './entry';
import { FolderIcon } from './icons';

interface SftpPreviewProps {
	entry: SftpEntry | null;
	peek: (path: string) => Promise<SftpListing>;
	/** Entra en la carpeta de la vista previa. */
	onOpen: (path: string) => void;
	/** Entra en la carpeta de la vista previa y deja elegida una de sus carpetas. */
	onDrill: (parent: string, child: SftpEntry) => void;
}

type Peeked = { path: string; entries: SftpEntry[] } | { path: string; error: string };

/**
 * Lo que hay dentro de la carpeta elegida, sin entrar en ella. Pulsar una de
 * sus carpetas entra en la elegida y deja esa como la siguiente vista previa:
 * así se baja por la ruta viendo siempre un nivel por delante.
 */
export const SftpPreview: React.FC<SftpPreviewProps> = ({ entry, peek, onOpen, onDrill }) => {
	const [peeked, setPeeked] = useState<Peeked | null>(null);
	const folder = entry && isNavigable(entry) ? entry : null;

	useEffect(() => {
		if (!folder) return;
		let alive = true;
		peek(folder.path)
			.then(result => alive && setPeeked({ path: folder.path, entries: result.entries }))
			.catch((err: unknown) =>
				alive && setPeeked({
					path: folder.path,
					error: err instanceof Error ? err.message : 'No se pudo leer la carpeta',
				}),
			);
		return () => {
			alive = false;
		};
	}, [folder, peek]);

	const current = folder && peeked?.path === folder.path ? peeked : null;
	const visible = current && 'entries' in current ? current.entries.filter(e => !e.name.startsWith('.')) : [];
	const hidden = current && 'entries' in current ? current.entries.length - visible.length : 0;

	return (
		<div className="glass-soft rounded-xl overflow-hidden h-full min-h-0 flex flex-col">
			<div className="flex items-center gap-2 px-3 h-10 border-b border-line shrink-0">
				<span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Vista previa</span>
			</div>

			{!entry ? (
				<div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
					<FolderIcon className="w-7 h-7 text-white/25" />
					<p className="text-sm text-white/55">Elige una carpeta para ver qué contiene</p>
					<p className="text-xs text-white/35">Doble clic para entrar en ella</p>
				</div>
			) : !folder ? (
				/* Un archivo: sus datos, que en la lista van recortados. */
				<div className="p-4 space-y-4 min-h-0 overflow-y-auto scroll-thin">
					<div className="flex items-start gap-2.5">
						<span className="mt-0.5 shrink-0">{entryIcon(entry, 'w-5 h-5')}</span>
						<p className="text-sm text-white break-all">{entry.name}</p>
					</div>
					<dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-2 text-xs">
						<dt className="text-white/40">Tamaño</dt>
						<dd className="font-mono text-white/75">{formatSize(entry.size)}</dd>
						<dt className="text-white/40">Permisos</dt>
						<dd className="font-mono text-white/75">{entry.permissions}</dd>
						<dt className="text-white/40">Modificado</dt>
						<dd className="text-white/75">
							{entry.mtime ? new Date(entry.mtime).toLocaleString() : '—'}
						</dd>
						<dt className="text-white/40">Propietario</dt>
						<dd className="font-mono text-white/75">{entry.uid}:{entry.gid}</dd>
						<dt className="text-white/40">Ruta</dt>
						<dd className="font-mono text-white/75 break-all">{entry.path}</dd>
					</dl>
				</div>
			) : (
				<>
					<div className="px-3 py-2.5 border-b border-line shrink-0 flex items-center gap-2">
						<FolderIcon className="w-4 h-4 text-violet-300 shrink-0" />
						<span className="flex-1 min-w-0 text-sm text-white truncate" title={folder.path}>
							{folder.name}
						</span>
						<button
							type="button"
							onClick={() => onOpen(folder.path)}
							className="h-7 px-3 rounded-lg glass-soft row-hit text-xs font-medium text-white/80 hover:text-white transition shrink-0"
						>
							Abrir
						</button>
					</div>

					<div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
						{!current ? (
							<p className="px-3 py-8 text-center text-xs text-white/45">Leyendo…</p>
						) : 'error' in current ? (
							<p className="px-3 py-8 text-center text-xs text-rose-300">{current.error}</p>
						) : visible.length === 0 ? (
							<p className="px-3 py-8 text-center text-xs text-white/45">
								{hidden > 0 ? `Solo hay ${hidden} elementos ocultos` : 'Carpeta vacía'}
							</p>
						) : (
							visible.map(child => {
								const nav = isNavigable(child);
								return (
									<button
										key={child.path}
										type="button"
										disabled={!nav}
										onClick={() => nav && onDrill(folder.path, child)}
										title={nav ? `Entrar en ${folder.name} y ver ${child.name}` : child.name}
										className={`w-full flex items-center gap-2.5 px-3 h-8 text-left transition ${
											nav ? 'hover:bg-tint-hover' : 'cursor-default'
										}`}
									>
										<span className="flex shrink-0">{entryIcon(child, 'w-3.5 h-3.5')}</span>
										<span className={`flex-1 min-w-0 truncate text-xs ${nav ? 'text-white/85' : 'text-white/55'}`}>
											{child.name}
										</span>
										{!nav && (
											<span className="text-[11px] font-mono tabular-nums text-white/35 shrink-0">
												{formatSize(child.size)}
											</span>
										)}
									</button>
								);
							})
						)}
					</div>

					{current && 'entries' in current && (
						<div className="px-3 h-8 border-t border-line shrink-0 flex items-center text-[11px] text-white/40">
							{current.entries.length} elementos
							{hidden > 0 && ` · ${hidden} ocultos`}
							{folder.mtime ? ` · ${timeAgo(new Date(folder.mtime))}` : ''}
						</div>
					)}
				</>
			)}
		</div>
	);
};
