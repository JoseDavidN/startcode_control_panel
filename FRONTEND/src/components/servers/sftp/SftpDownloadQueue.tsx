import React from 'react';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { formatSize } from '@services/sftp.service';
import type { DownloadItem } from '@typings/sftp.types';
import { XIcon } from './icons';

interface SftpDownloadQueueProps {
	items: DownloadItem[];
	onCancel: (id: string) => void;
	onRetry: (id: string) => void;
	onClearFinished: () => void;
}

const statusTone: Record<DownloadItem['status'], string> = {
	queued: 'text-white/45',
	downloading: 'text-white',
	done: 'text-emerald-300',
	error: 'text-rose-300',
	canceled: 'text-white/40',
};

const statusLabel = (item: DownloadItem) => {
	switch (item.status) {
		case 'done': return 'Listo';
		case 'error': return 'Error';
		case 'canceled': return 'Cancelado';
		case 'queued': return 'En cola';
		/* Un .zip no sabe cuánto medirá hasta terminar: solo lo que lleva. */
		default: return item.total ? `${Math.min(100, (item.loaded / item.total) * 100).toFixed(0)} %` : formatSize(item.loaded);
	}
};

/** Cola de descargas: mismo aspecto que la de subidas, con su propio desplazamiento. */
export const SftpDownloadQueue: React.FC<SftpDownloadQueueProps> = ({ items, onCancel, onRetry, onClearFinished }) => {
	const finished = items.some(i => ['done', 'canceled', 'error'].includes(i.status));

	return (
		<div className="glass-soft rounded-xl h-full min-h-0 flex flex-col overflow-hidden">
			<div className="px-3 h-10 border-b border-line shrink-0 flex items-center justify-between gap-2">
				<span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Descargas</span>
				{finished && (
					<button
						type="button"
						onClick={onClearFinished}
						className="h-6 px-2.5 rounded-lg text-[11px] font-medium text-white/55 hover:text-white hover:bg-tint-hover transition"
					>
						Limpiar terminados
					</button>
				)}
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto scroll-thin p-2 space-y-1.5">
				{items.map(item => (
					<div key={item.id} className="glass rounded-lg px-2.5 py-2">
						<div className="flex items-center gap-2">
							<span className="flex-1 min-w-0 text-xs font-mono truncate text-white/75" title={`${item.path} → ${item.dest}`}>
								{item.name}
							</span>
							<span className={`text-[11px] tabular-nums shrink-0 ${statusTone[item.status]}`}>{statusLabel(item)}</span>

							{(item.status === 'downloading' || item.status === 'queued') && (
								<button
									type="button"
									onClick={() => onCancel(item.id)}
									title="Cancelar"
									className="w-6 h-6 rounded-md glass-soft text-white/50 hover:text-white flex items-center justify-center shrink-0"
								>
									<XIcon className="w-3 h-3" />
								</button>
							)}
							{item.status === 'error' && (
								<button
									type="button"
									onClick={() => onRetry(item.id)}
									className="h-6 px-2 rounded-md glass-soft text-[11px] text-white/70 hover:text-white shrink-0"
								>
									Reintentar
								</button>
							)}
							{item.status === 'done' && (
								<button
									type="button"
									onClick={() => void revealItemInDir(item.dest).catch(() => undefined)}
									className="h-6 px-2 rounded-md glass-soft text-[11px] text-white/70 hover:text-white shrink-0"
								>
									Mostrar
								</button>
							)}
						</div>

						{item.status === 'downloading' && (
							<div className="bg-track h-1 rounded-full overflow-hidden mt-1.5">
								{item.total ? (
									<div
										className="h-full rounded-full transition-all"
										style={{
											width: `${Math.min(100, (item.loaded / item.total) * 100)}%`,
											background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))',
										}}
									/>
								) : (
									<div
										className="h-full w-full rounded-full animate-pulse"
										style={{ background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))' }}
									/>
								)}
							</div>
						)}

						{item.error && item.status === 'error' && (
							<p className="text-[11px] text-rose-300/80 mt-1 break-words">{item.error}</p>
						)}
					</div>
				))}
			</div>
		</div>
	);
};
