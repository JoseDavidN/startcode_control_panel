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
