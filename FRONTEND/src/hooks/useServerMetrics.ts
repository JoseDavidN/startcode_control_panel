// src/hooks/useServerMetrics.ts
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api.service';
import { API_CONFIG } from '../utils/constants';

export interface ServerMetrics {
	cpu: number;
	memory: number;
	disk: number;
	uptime?: string;
	activeServices?: number;
	runningServices?: number;
}

function normalizeMetrics(raw: any): ServerMetrics {
	const cpuVal = raw?.cpu ?? raw?.cpuUsage ?? raw?.cpu_percent;
	const memVal =
		raw?.memory ?? raw?.ram ?? raw?.memoryUsage ?? raw?.mem_percent;
	const diskVal = raw?.disk ?? raw?.diskUsage ?? raw?.disk_percent;
	const cpu = Math.max(0, Math.min(100, Number(cpuVal ?? 0)));
	const memory = Math.max(0, Math.min(100, Number(memVal ?? 0)));
	const disk = Math.max(0, Math.min(100, Number(diskVal ?? 0)));
	const uptime =
		typeof raw?.uptime === 'string'
			? raw.uptime
			: typeof raw?.uptime_human === 'string'
			? raw.uptime_human
			: undefined;
	const activeServices = Number(raw?.activeServices ?? 0);
	const runningServices = Number(
		raw?.runningServices ?? raw?.activeServices ?? 0
	);
	return { cpu, memory, disk, uptime, activeServices, runningServices };
}

export function useServerMetrics(
	serverId: string,
	refetchIntervalMs: number = 10000
) {
	return useQuery<ServerMetrics>({
		queryKey: ['serverMetrics', serverId],
		enabled: !!serverId,
		refetchInterval: refetchIntervalMs,
		refetchIntervalInBackground: true,
		staleTime: 15000,
		retry: false,
		queryFn: async () => {
			// 1) Intento: quick-stats
			try {
				const respQuick = await apiService.get<any>(
					`${API_CONFIG.ENDPOINTS.MONITORING}/servers/${serverId}/quick-stats`
				);
				const payloadQuick =
					respQuick && respQuick.data ? respQuick.data : respQuick;
				const dataQuick =
					payloadQuick && payloadQuick.data
						? payloadQuick.data
						: payloadQuick;
				const metricsQuick = normalizeMetrics(dataQuick);
				// Validar que haya al menos un valor distinto a 0 o uptime/runningServices definidos
				if (
					Number.isFinite(metricsQuick.cpu) ||
					Number.isFinite(metricsQuick.memory) ||
					Number.isFinite(metricsQuick.disk) ||
					typeof metricsQuick.uptime === 'string' ||
					Number.isFinite(metricsQuick.activeServices)
				) {
					return metricsQuick;
				}
			} catch (e) {
				// continuará con fallback
			}

			// Retornar métricas vacías si falla todo
			return normalizeMetrics({});
		},
	});
}
