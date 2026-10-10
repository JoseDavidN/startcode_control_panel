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

/**
 * Lo que el asistente pega en la shell: una sola línea y sin salto final,
 * para que nunca se ejecute sin que el usuario pulse Enter. Las líneas de un
 * bloque se encadenan con `&&` y las continuaciones con `\` se juntan.
 */
export function toSingleLine(text: string): string {
	const line = text
		.replace(/\\\r?\n\s*/g, ' ')
		.split(/\r?\n/)
		.map(l => l.trim())
		.filter(l => l && !l.startsWith('#'))
		.join(' && ');
	/* Sin caracteres de control: un ^C o un ESC pegados actuarían en la shell. */
	return Array.from(line).filter(ch => ch >= ' ' && ch !== '\x7f').join('');
}
