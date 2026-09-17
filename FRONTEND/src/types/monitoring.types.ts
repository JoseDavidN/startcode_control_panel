/** Espejo de BACKEND/src/monitoring/dto/agent-data-response.dto.ts */

export interface AccountOverview {
	servers: number;
	/** Servidores que alguna vez han reportado métricas */
	reporting: number;
	services: number;
	websites: number;
	databases: number;
	processes: number;
	avgCpu: number;
	avgMemory: number;
	/** null = ningún servidor ha reportado nunca */
	lastReportAt: string | null;
}

export interface MetricPoint {
	timestamp: string;
	value: number;
}

export interface HistoricalMetrics {
	serverId: string;
	cpu: MetricPoint[];
	memory: MetricPoint[];
	disk: MetricPoint[];
	loadAverage: MetricPoint[];
	connections: MetricPoint[];
	startTime: string;
	endTime: string;
}

export interface ServerSummary {
	serverId: string;
	timestamp: string;
	cpu: number;
	memory: number;
	disk: number;
	connections: number;
}

/**
 * Estado en vivo de un servidor para la lista.
 *
 * `null` significa «todavía sin dato» —un servidor sin agente, o un inventario
 * que aún no ha llegado—, nunca cero. La interfaz pinta `—` en esos casos.
 */
export interface ServerLiveSummary {
	serverId: string;
	name: string;
	status: string;
	agentConnected: boolean;
	lastSeen: string | null;
	hasMetrics: boolean;
	lastMetricAt: string | null;
	cpu: number | null;
	memory: number | null;
	disk: number | null;
	uptime: number | null;
	services: number | null;
	servicesTotal: number | null;
	servicesFailed: number | null;
	websites: number | null;
	databases: number | null;
	processes: number | null;
	agentVersion: string | null;
}

export interface ServersSummary {
	servers: ServerLiveSummary[];
	total: number;
	online: number;
	generatedAt: string;
}
