// src/utils/time.ts

/** "hace 5 min", "hace 2 h", "ayer"… Devuelve '—' si la fecha no es válida. */
export function timeAgo(date: Date | string | null | undefined): string {
	if (!date) return '—';
	const d = typeof date === 'string' ? new Date(date) : date;
	if (Number.isNaN(d.getTime())) return '—';

	const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
	if (seconds < 60) return 'hace un momento';

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `hace ${minutes} min`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `hace ${hours} h`;

	const days = Math.floor(hours / 24);
	if (days === 1) return 'ayer';
	if (days < 30) return `hace ${days} días`;

	return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Fecha y hora completas para el tooltip de una fila. */
export function fullDateTime(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleString('es-ES', {
		day: '2-digit', month: 'short', year: 'numeric',
		hour: '2-digit', minute: '2-digit',
	});
}
