import React from 'react';
import { formatSize } from '@services/sftp.service';
import type { UploadItem } from '@typings/sftp.types';
import { XIcon } from './icons';

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

export const SftpUploadQueue: React.FC<SftpUploadQueueProps> = ({
	items,
	totals,
	onCancel,
	onRetry,
	onRetryAllConflicts,
	onClearFinished,
}) => {
	if (items.length === 0) return null;

	const globalPct = totals.bytes > 0 ? (totals.loaded / totals.bytes) * 100 : 0;
	const finished = items.filter(i =>
		['done', 'canceled', 'error'].includes(i.status),
	).length;

	return (
		<div className="glass-soft rounded-xl border border-white/[0.06] p-4 space-y-3">
			<div className="flex items-center justify-between gap-3 flex-wrap">
				<div>
					<p className="text-sm font-semibold text-white">
						{totals.done} de {totals.files} archivos
					</p>
					<p className="text-xs text-white/45 font-mono tabular-nums">
						{formatSize(totals.loaded)} / {formatSize(totals.bytes)}
						{totals.failed > 0 && ` · ${totals.failed} con error`}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{totals.conflicts > 0 && (
						<button
							type="button"
							onClick={onRetryAllConflicts}
							className="h-9 px-3.5 rounded-xl glass-soft text-amber-300 text-xs font-medium
								hover:bg-white/[0.07] transition"
						>
							Sobrescribir todos ({totals.conflicts})
						</button>
					)}
					{finished > 0 && (
						<button
							type="button"
							onClick={onClearFinished}
							className="h-9 px-3.5 rounded-xl glass-soft text-white/65 text-xs font-medium
								hover:text-white hover:bg-white/[0.07] transition"
						>
							Limpiar terminados
						</button>
					)}
				</div>
			</div>

			<div className="bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
				<div
					className="h-full rounded-full transition-all duration-500"
					style={{
						width: `${Math.min(100, globalPct)}%`,
						background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2))',
					}}
				/>
			</div>

			<div className="max-h-40 overflow-y-auto scroll-thin space-y-1.5">
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
						<div key={item.id} className="glass rounded-xl px-3 py-2">
							<div className="flex items-center gap-3">
								<span
									className="flex-1 min-w-0 text-xs font-mono truncate text-white/75"
									title={item.relPath}
								>
									{item.relPath}
								</span>
								<span className={`text-xs tabular-nums shrink-0 ${statusTone[item.status]}`}>
									{item.status === 'done'
										? 'Listo'
										: item.status === 'conflict'
											? 'Ya existe'
											: item.status === 'error'
												? 'Error'
												: item.status === 'canceled'
													? 'Cancelado'
													: item.status === 'queued'
														? 'En cola'
														: `${pct.toFixed(0)} %`}
								</span>

								{item.status === 'uploading' && (
									<button
										type="button"
										onClick={() => onCancel(item.id)}
										title="Cancelar"
										className="w-6 h-6 rounded-lg glass-soft text-white/50 hover:text-white
											flex items-center justify-center shrink-0"
									>
										<XIcon className="w-3 h-3" />
									</button>
								)}
								{(item.status === 'error' || item.status === 'conflict') && (
									<button
										type="button"
										onClick={() => onRetry(item.id, item.status === 'conflict')}
										className="h-6 px-2 rounded-lg glass-soft text-[11px] text-white/70
											hover:text-white shrink-0"
									>
										{item.status === 'conflict' ? 'Sobrescribir' : 'Reintentar'}
									</button>
								)}
							</div>

							{item.status === 'uploading' && (
								<div className="bg-white/[0.06] h-1 rounded-full overflow-hidden mt-1.5">
									<div
										className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
										style={{ width: `${pct}%` }}
									/>
								</div>
							)}

							{item.error && item.status !== 'canceled' && (
								<p className="text-[11px] text-rose-300/80 mt-1">{item.error}</p>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};
