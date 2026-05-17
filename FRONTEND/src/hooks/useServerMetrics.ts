// src/hooks/useServerMetrics.ts
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@services/api.service';
import { API_CONFIG } from '@utils/constants';

export interface ServerMetrics {
	cpu: number;
	memory: number;
	disk: number;
	uptime?: string | number;
	activeServices?: number;
	runningServices?: number;
}

function normalizeMetrics(raw: any): ServerMetrics {
	// Backend response shape: { cpu: { usage }, memory: { usagePercent }, disk: { filesystems: [{ usagePercent }] }, system: { uptime } }
	const cpuVal = raw?.cpu?.usage ?? raw?.cpu ?? raw?.cpuUsage ?? raw?.cpu_percent;
	const memVal =
		raw?.memory?.usagePercent ?? raw?.memory ?? raw?.ram ?? raw?.memoryUsage ?? raw?.mem_percent;
	const diskVal =
		raw?.disk?.filesystems?.[0]?.usagePercent ?? raw?.disk ?? raw?.diskUsage ?? raw?.disk_percent;
	const cpu = Math.max(0, Math.min(100, Number(cpuVal ?? 0)));
	const memory = Math.max(0, Math.min(100, Number(memVal ?? 0)));
	const disk = Math.max(0, Math.min(100, Number(diskVal ?? 0)));
	const uptime =
		raw?.system?.uptime !== undefined
			? raw.system.uptime
			: typeof raw?.uptime === 'string'
			? raw.uptime
			: typeof raw?.uptime_human === 'string'
			? raw.uptime_human
			: undefined;
	const activeServices = Number(raw?.services?.count ?? raw?.activeServices ?? 0);
	const runningServices = Number(raw?.runningServices ?? raw?.activeServices ?? 0);
	return { cpu, memory, disk, uptime, activeServices, runningServices };
}

export function useServerMetrics(
	serverId: string,
	refetchIntervalMs: number = 30000
) {
	return useQuery<ServerMetrics>({
		queryKey: ['serverMetrics', serverId],
		enabled: !!serverId,
		refetchInterval: refetchIntervalMs,
		refetchIntervalInBackground: true,
		staleTime: 15000,
		retry: false,
		queryFn: async () => {
			try {
				const respRaw = await apiService.get<any>(
					`${API_CONFIG.ENDPOINTS.AGENT_DATA}/servers/${serverId}/latest`
				);
				const payload = respRaw?.data ?? respRaw;
				const data = payload?.data ?? payload;
				return normalizeMetrics(data);
			} catch {
				return normalizeMetrics({});
			}
		},
	});
}
