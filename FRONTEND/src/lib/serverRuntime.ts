import type { RealtimeServerData } from '@contexts/realtime-metrics-context';
import type { ServerLiveSummary } from '@typings/monitoring.types';

/**
 * Mezcla de la instantánea HTTP con lo que llega por WebSocket.
 *
 * Es una función pura y es el **único** sitio donde se decide el estado, los
 * números y los contadores de un servidor: así la cabecera, el badge y el punto
 * pulsante no pueden contradecirse, que es lo que pasaba cuando cada uno los
 * calculaba por su cuenta.
 */

export type ServerRuntimeState = 'online' | 'offline' | 'warning' | 'unknown';

export interface ServerRuntime {
	id: string;
	state: ServerRuntimeState;
	/** Ha llegado algo por WebSocket en esta sesión */
	live: boolean;
	hasMetrics: boolean;
	/** Hay métricas, pero el último reporte ya es viejo */
	stale: boolean;
	lastMetricAt: Date | null;
	cpu: number | null;
	memory: number | null;
	disk: number | null;
	uptime: number | null;
	services: number | null;
	servicesTotal: number | null;
	processes: number | null;
}

/** Mismo umbral que `ServerStatusService.OFFLINE_THRESHOLD_MINUTES` en el backend. */
export const STALE_METRICS_MS = 5 * 60_000;

const asDate = (value: string | Date | null | undefined): Date | null => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

/** Estado persistido → estado de interfaz. */
const fromStatus = (status: string | undefined): ServerRuntimeState => {
	if (status === 'online') return 'online';
	/* 'offline' caía antes en el caso por defecto y se pintaba «Atención». */
	if (status === 'offline' || status === 'error') return 'offline';
	if (status === 'warning' || status === 'maintenance' || status === 'checking' || status === 'pending')
		return 'warning';
	return 'unknown';
};

export function mergeServerRuntime(
	snapshot: ServerLiveSummary | undefined,
	live: RealtimeServerData | undefined,
	fallbackStatus: string | undefined,
	now: number = Date.now(),
): ServerRuntime {
	const snapshotAt = asDate(snapshot?.lastMetricAt);
	const liveAt = asDate(live?.timestamp);

	/* Gana la fuente más reciente, no «el WebSocket siempre»: un refetch lanzado
	   antes puede llegar después y rebobinaría la interfaz. Las dos marcas las
	   pone el reloj del backend, así que son comparables. */
	const useLive = Boolean(
		live?.metrics && liveAt && (!snapshotAt || liveAt.getTime() >= snapshotAt.getTime()),
	);

	const lastMetricAt = useLive ? liveAt : (snapshotAt ?? liveAt);
	const hasMetrics = Boolean(snapshot?.hasMetrics) || Boolean(live?.metrics);

	const cpu = useLive ? (live?.metrics?.cpu ?? null) : (snapshot?.cpu ?? null);
	const memory = useLive ? (live?.metrics?.memory ?? null) : (snapshot?.memory ?? null);
	const disk = useLive ? (live?.metrics?.disk ?? null) : (snapshot?.disk ?? null);
	const uptime = useLive ? (live?.metrics?.uptime ?? null) : (snapshot?.uptime ?? null);

	/* El evento trae la lista entera; el resumen cuenta solo las unidades
	   activas. Sin esta normalización el número salta de 39 a 105 al llegar el
	   inventario y vuelve a bajar en el siguiente refresco. */
	const liveServicesActive = live?.services?.filter(s => s.state === 'active').length;

	const state: ServerRuntimeState = (() => {
		if (live?.status === 'online') return 'online';
		if (live?.status === 'offline') return 'offline';
		if (snapshot?.agentConnected) return 'online';
		const fromPersisted = fromStatus(snapshot?.status ?? fallbackStatus);
		/* Sin métricas y sin agente conectado no es «offline»: es que nunca ha
		   dicho nada. Se distingue para no acusar de caído a lo que no se ha
		   instalado todavía. */
		if (!hasMetrics && fromPersisted !== 'online') return 'unknown';
		return fromPersisted;
	})();

	return {
		id: snapshot?.serverId ?? '',
		state,
		live: Boolean(live?.metrics || live?.status),
		hasMetrics,
		stale: Boolean(hasMetrics && lastMetricAt && now - lastMetricAt.getTime() > STALE_METRICS_MS),
		lastMetricAt,
		cpu,
		memory,
		disk,
		uptime,
		services: liveServicesActive ?? snapshot?.services ?? null,
		servicesTotal: live?.services?.length ?? snapshot?.servicesTotal ?? null,
		processes: live?.processes?.total ?? snapshot?.processes ?? null,
	};
}

/** Runtime vacío, para un servidor que aún no aparece en el resumen. */
export function emptyRuntime(id: string, status?: string): ServerRuntime {
	const state = fromStatus(status);
	return {
		id,
		state: state === 'online' ? 'online' : 'unknown',
		live: false,
		hasMetrics: false,
		stale: false,
		lastMetricAt: null,
		cpu: null,
		memory: null,
		disk: null,
		uptime: null,
		services: null,
		servicesTotal: null,
		processes: null,
	};
}
