// src/utils/commands.ts
import type { CommandStatus } from '@services/command.service';

/** Tono del badge de estado de un comando (ok, error, tiempo agotado…). */
export const STATUS_TONE: Record<CommandStatus, string> = {
	ok: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20',
	error: 'bg-rose-500/15 text-rose-300 ring-rose-400/20',
	timeout: 'bg-amber-500/15 text-amber-300 ring-amber-400/20',
	failed: 'bg-rose-500/15 text-rose-300 ring-rose-400/20',
};

export const statusLabel = (status: CommandStatus, exitCode: number | null) =>
	status === 'timeout' ? 'tiempo agotado'
		: status === 'failed' ? 'no ejecutado'
			: `exit ${exitCode ?? '?'}`;

export const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
