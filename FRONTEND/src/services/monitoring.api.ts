// src/services/monitoring.api.ts
import { apiService } from './api.service';
import { API_CONFIG } from '@utils/constants';
import type {
	AccountOverview,
	HistoricalMetrics,
	ServerSummary,
} from '@typings/monitoring.types';

function unwrap<T>(response: unknown): T {
	const first = (response as { data?: unknown })?.data ?? response;
	const second = (first as { data?: unknown })?.data ?? first;
	return second as T;
}

const AGENT = API_CONFIG.ENDPOINTS.AGENT_DATA;

export const monitoringApi = {
	/** Agregado de toda la cuenta en una sola consulta. */
	async overview(): Promise<AccountOverview> {
		const res = await apiService.get<AccountOverview>(`${AGENT}/overview`);
		return unwrap<AccountOverview>(res);
	},

	async historical(serverId: string, hours = 24): Promise<HistoricalMetrics> {
		const res = await apiService.get<HistoricalMetrics>(
			`${AGENT}/servers/${serverId}/historical?hours=${hours}`,
		);
		return unwrap<HistoricalMetrics>(res);
	},

	async summary(serverId: string): Promise<ServerSummary | null> {
		const res = await apiService.get<ServerSummary>(`${AGENT}/servers/${serverId}/summary`);
		return unwrap<ServerSummary>(res) ?? null;
	},
};
