/**
 * Espejo de BACKEND/src/auth/types/user-preferences.type.ts.
 * Mantener ambos archivos sincronizados: el PATCH valida contra los mismos rangos.
 */

export type SidebarMode = 'expanded' | 'collapsed';
export type ServersView = 'cards' | 'list';
/** Piel de la aplicación; los tokens de cada tema viven en App.css. */
export type Theme = 'dark' | 'aurora' | 'solar';

export const THEMES: readonly Theme[] = ['dark', 'aurora', 'solar'];

/** Familia tipográfica de la interfaz; las fuentes van empaquetadas en src/assets/fonts. */
export type FontFamily = 'grotesk' | 'mono' | 'rounded';

export const FONTS: readonly FontFamily[] = ['grotesk', 'mono', 'rounded'];

export interface AppearancePrefs {
	theme: Theme;
	font: FontFamily;
	sidebarMode: SidebarMode;
	reducedMotion: boolean;
	serversView: ServersView;
}

export interface NotificationPrefs {
	serverOffline: boolean;
	highCpuUsage: boolean;
	highMemoryUsage: boolean;
	highDiskUsage: boolean;
	securityAlerts: boolean;
	weeklyReport: boolean;
	productNews: boolean;
}

export interface SecurityPrefs {
	sessionTimeout: number; // minutos, 0 = nunca
	passwordExpiration: number; // días, 0 = nunca
}

export interface MonitoringPrefs {
	refreshInterval: number; // segundos
	cpuThreshold: number; // %
	memoryThreshold: number; // %
	diskThreshold: number; // %
	retentionDays: number;
}

export interface UserPreferences {
	appearance: AppearancePrefs;
	notifications: NotificationPrefs;
	security: SecurityPrefs;
	monitoring: MonitoringPrefs;
}

export type PreferenceSection = keyof UserPreferences;

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
	);
}

export const DEFAULT_PREFERENCES: UserPreferences = {
	appearance: { theme: 'dark', font: 'grotesk', sidebarMode: 'expanded', reducedMotion: false, serversView: 'cards' },
	notifications: {
		serverOffline: true,
		highCpuUsage: true,
		highMemoryUsage: true,
		highDiskUsage: false,
		securityAlerts: true,
		weeklyReport: true,
		productNews: false,
	},
	security: { sessionTimeout: 30, passwordExpiration: 90 },
	monitoring: {
		refreshInterval: 30,
		cpuThreshold: 80,
		memoryThreshold: 85,
		diskThreshold: 90,
		retentionDays: 30,
	},
};


/**
 * Elimina las claves con valor `undefined`. class-transformer materializa los
 * campos opcionales del DTO como propiedades propias con valor undefined, y al
 * hacer spread pisarían el valor guardado (y JSON.stringify las descartaría,
 * dejando la sección incompleta en la base de datos).
 */
function defined<T extends object>(source: T | undefined | null): Partial<T> {
	if (!source) return {};
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined) out[key] = value;
	}
	return out as Partial<T>;
}

/** Merge por sección: lo que no se envía no se pisa. */
export type PartialPreferences = { [K in PreferenceSection]?: Partial<UserPreferences[K]> };

export function mergePreferences(
	current: PartialPreferences | null | undefined,
	patch: PartialPreferences
): UserPreferences {
	const base = current ?? {};
	return {
		appearance: { ...DEFAULT_PREFERENCES.appearance, ...defined(base.appearance), ...defined(patch.appearance) },
		notifications: { ...DEFAULT_PREFERENCES.notifications, ...defined(base.notifications), ...defined(patch.notifications) },
		security: { ...DEFAULT_PREFERENCES.security, ...defined(base.security), ...defined(patch.security) },
		monitoring: { ...DEFAULT_PREFERENCES.monitoring, ...defined(base.monitoring), ...defined(patch.monitoring) },
	};
}

/* ── Saneado ──────────────────────────────────────────────────────────
   Los inputs numéricos hacen `+e.target.value`: vacío da NaN, que JSON
   convierte en null y el DTO rechaza con 400. Recortamos aquí en cliente
   usando exactamente los mismos rangos que update-preferences.dto.ts. */

const ENUMS: Record<string, readonly string[]> = {
	theme: THEMES,
	font: FONTS,
	sidebarMode: ['expanded', 'collapsed'],
	serversView: ['cards', 'list'],
};

const RANGES: Record<string, [number, number]> = {
	sessionTimeout: [0, 1440],
	passwordExpiration: [0, 365],
	refreshInterval: [5, 3600],
	cpuThreshold: [1, 100],
	memoryThreshold: [1, 100],
	diskThreshold: [1, 100],
	retentionDays: [1, 3650],
};

function clamp(key: string, value: number): number | null {
	if (!Number.isFinite(value)) return null;
	const range = RANGES[key];
	const rounded = Math.round(value);
	if (!range) return rounded;
	return Math.min(range[1], Math.max(range[0], rounded));
}

/** Devuelve una copia del patch con tipos válidos; descarta lo que el backend rechazaría. */
export function sanitizeSection<K extends PreferenceSection>(
	section: K,
	value: Partial<UserPreferences[K]>
): Partial<UserPreferences[K]> {
	const defaults = DEFAULT_PREFERENCES[section] as Record<string, unknown>;
	const out: Record<string, unknown> = {};

	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		if (!(key in defaults)) continue;

		const allowed = ENUMS[key];
		if (allowed) {
			if (typeof raw === 'string' && allowed.includes(raw)) out[key] = raw;
			continue;
		}
		if (typeof defaults[key] === 'boolean') {
			out[key] = !!raw; // booleano real: enableImplicitConversion convertiría "false" en true
			continue;
		}
		if (typeof defaults[key] === 'number') {
			const n = clamp(key, Number(raw));
			if (n !== null) out[key] = n;
		}
	}

	return out as Partial<UserPreferences[K]>;
}
