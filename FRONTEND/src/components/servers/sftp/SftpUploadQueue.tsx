import React from 'react';
import { formatSize } from '@services/sftp.service';
import type { UploadItem } from '@typings/sftp.types';
import { UploadIcon, XIcon } from './icons';

interface SftpUploadQueueProps {
	items: UploadItem[];
	totals: {
		files: number;
		done: number;
		failed: number;
		conflicts: number;
		bytes: number;
		loaded: number;
	};
	onCancel: (id: string) => void;
	onRetry: (id: string, overwrite?: boolean) => void;
	onRetryAllConflicts: () => void;
	onRetryAllFailed: () => void;
	onClearFinished: () => void;
}

const statusTone: Record<UploadItem['status'], string> = {
	queued: 'text-white/45',
	uploading: 'text-white',
	done: 'text-emerald-300',
	error: 'text-rose-300',
	canceled: 'text-white/40',
	conflict: 'text-amber-300',
};

const statusLabel = (item: UploadItem, pct: number) => {
	switch (item.status) {
		case 'done': return 'Listo';
		case 'conflict': return 'Ya existe';
		case 'error': return 'Error';
		case 'canceled': return 'Cancelado';
		case 'queued': return 'En cola';
		default: return `${pct.toFixed(0)} %`;
	}
};

/** Cola de subidas: ocupa el alto que le deja la columna y desplaza dentro. */
export const SftpUploadQueue: React.FC<SftpUploadQueueProps> = ({
	items,
	totals,
	onCancel,
	onRetry,
	onRetryAllConflicts,
	onRetryAllFailed,
	onClearFinished,
}) => {
	const globalPct = totals.bytes > 0 ? (totals.loaded / totals.bytes) * 100 : 0;
	const finished = items.filter(i =>
		['done', 'canceled', 'error'].includes(i.status),
	).length;

	return (
		<div className="glass-soft rounded-xl h-full min-h-0 flex flex-col overflow-hidden">
			<div className="px-3 h-10 border-b border-line shrink-0 flex items-center justify-between gap-2">
				<span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Subidas</span>
				{finished > 0 && (
					<button
						type="button"
						onClick={onClearFinished}
						className="h-6 px-2.5 rounded-lg text-[11px] font-medium text-white/55 hover:text-white hover:bg-tint-hover transition"
					>
						Limpiar terminados
					</button>
				)}
			</div>

			{items.length === 0 ? (
				<div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
					<UploadIcon className="w-6 h-6 text-white/25" />
					<p className="text-xs text-white/45">Lo que subas aparecerá aquí, con su progreso</p>
				</div>
			) : (
				<>
					<div className="px-3 py-3 border-b border-line shrink-0 space-y-2">
						<div className="flex items-baseline justify-between gap-3">
							<p className="text-sm font-semibold text-white tabular-nums">
								{totals.done} de {totals.files}
							</p>
							<p className="text-[11px] text-white/45 font-mono tabular-nums truncate">
								{formatSize(totals.loaded)} / {formatSize(totals.bytes)}
							</p>
						</div>
						<div className="bg-track h-1.5 rounded-full overflow-hidden">
							<div
								className="h-full rounded-full transition-all duration-500"
								style={{
									width: `${Math.min(100, globalPct)}%`,
									background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))',
								}}
							/>
						</div>
						{(totals.conflicts > 0 || totals.failed > 0) && (
							<div className="flex items-center gap-2 flex-wrap pt-0.5">
								{totals.failed > 0 && (
									<button
										type="button"
										onClick={onRetryAllFailed}
										className="h-7 px-3 rounded-lg glass-soft row-hit text-rose-300 text-[11px] font-medium transition"
									>
										Reintentar fallidos ({totals.failed})
									</button>
								)}
								{totals.conflicts > 0 && (
									<button
										type="button"
										onClick={onRetryAllConflicts}
										className="h-7 px-3 rounded-lg glass-soft row-hit text-amber-300 text-[11px] font-medium transition"
									>
										Sobrescribir todos ({totals.conflicts})
									</button>
								)}
							</div>
						)}
					</div>

					<div className="flex-1 min-h-0 overflow-y-auto scroll-thin p-2 space-y-1.5">
						{items.map(item => {
							/* El progreso mide bytes entregados al socket, no escritos por
							   SFTP: se topa en 99 % hasta que el servidor confirma. */
							const pct =
								item.status === 'done'
									? 100
									: item.size > 0
										? Math.min(99, (item.loaded / item.size) * 100)
										: 0;

							return (
								<div key={item.id} className="glass rounded-lg px-2.5 py-2">
									<div className="flex items-center gap-2">
										<span
											className="flex-1 min-w-0 text-xs font-mono truncate text-white/75"
											title={`${item.destDir}/${item.relPath}`}
										>
											{item.relPath}
										</span>
										<span className={`text-[11px] tabular-nums shrink-0 ${statusTone[item.status]}`}>
											{statusLabel(item, pct)}
										</span>

										{(item.status === 'uploading' || item.status === 'queued') && (
											<button
												type="button"
												onClick={() => onCancel(item.id)}
												title="Cancelar"
												className="w-6 h-6 rounded-md glass-soft text-white/50 hover:text-white
													flex items-center justify-center shrink-0"
											>
												<XIcon className="w-3 h-3" />
											</button>
										)}
										{(item.status === 'error' || item.status === 'conflict') && (
											<button
												type="button"
												onClick={() => onRetry(item.id, item.status === 'conflict')}
												className="h-6 px-2 rounded-md glass-soft text-[11px] text-white/70
													hover:text-white shrink-0"
											>
												{item.status === 'conflict' ? 'Sobrescribir' : 'Reintentar'}
											</button>
										)}
									</div>

									{item.status === 'uploading' && (
										<div className="bg-track h-1 rounded-full overflow-hidden mt-1.5">
											<div
												className="h-full rounded-full transition-all"
												style={{
													width: `${pct}%`,
													background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))',
												}}
											/>
										</div>
									)}

									{item.error && item.status !== 'canceled' && (
										<p className="text-[11px] text-rose-300/80 mt-1 break-words">{item.error}</p>
									)}
								</div>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
};
