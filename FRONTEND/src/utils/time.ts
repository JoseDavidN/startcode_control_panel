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

/**
 * Cuánto falta para una fecha futura: "en 62 días", "vence hoy", "caducó hace
 * 3 días". `timeAgo` no sirve para esto —una fecha futura le sale como "hace
 * un momento"—, y es justo lo que necesitan los certificados SSL.
 */
export function timeUntil(date: Date | string | null | undefined): string {
	if (!date) return '—';
	const d = typeof date === 'string' ? new Date(date) : date;
	if (Number.isNaN(d.getTime())) return '—';

	const seconds = Math.floor((d.getTime() - Date.now()) / 1000);
	if (seconds < 0) return `caducó ${timeAgo(d)}`;

	const days = Math.floor(seconds / 86400);
	if (days === 0) return 'vence hoy';
	if (days === 1) return 'vence mañana';
	if (days < 60) return `en ${days} días`;

	return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Días que faltan para una fecha; negativo si ya pasó. `null` si no hay dato. */
export function daysUntil(date: Date | string | null | undefined): number | null {
	if (!date) return null;
	const d = typeof date === 'string' ? new Date(date) : date;
	if (Number.isNaN(d.getTime())) return null;
	return Math.floor((d.getTime() - Date.now()) / 86400000);
}

/**
 * Tiempo activo en segundos → "17d 4h 5m". Formato único para la tarjeta de
 * servidores y el detalle, que antes mostraban semanas en una y días en otra.
 */
export function formatUptime(seconds: number | null | undefined): string {
	if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
	const total = Math.floor(seconds);
	const d = Math.floor(total / 86400);
	const h = Math.floor((total % 86400) / 3600);
	const m = Math.floor((total % 3600) / 60);
	if (d > 0) return `${d}d ${h}h ${m}m`;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}
