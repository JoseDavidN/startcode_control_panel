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
