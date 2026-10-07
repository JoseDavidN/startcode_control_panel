// src/utils/metrics.ts

/**
 * Escala de color por saturación, compartida por el detalle de servidor y el
 * dashboard: mismo umbral, mismo color, en toda la app.
 */
export const barGradient = (pct: number): string => {
	if (pct >= 90) return 'from-rose-500 to-orange-500';
	if (pct >= 70) return 'from-amber-400 to-orange-500';
	if (pct >= 50) return 'from-sky-500 to-cyan-400';
	return 'from-emerald-500 to-teal-400';
};

/** systemd y el agente reportan tamaños en bytes; esto es lo que se pinta. */
export const formatBytes = (bytes: number): string => {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${bytes} B`;
};
