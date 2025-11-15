// src/hooks/useServerStats.ts
import { useMemo } from 'react';
import { useServers } from './useServers';

export interface ServerStats {
	totalServers: number;
	onlineServers: number;
	// Placeholders hasta tener métricas reales del backend
	totalServices: number;
	runningServices: number;
}

export function useServerStats(): {
	stats: ServerStats;
	isLoading: boolean;
	isError: boolean;
	error: unknown;
} {
	const { data: servers = [], isLoading, isError, error } = useServers();

	const stats = useMemo<ServerStats>(() => {
		const totalServers = servers.length;
		const onlineServers = servers.filter(
			(s) => s.status === 'online'
		).length;
		// Hasta implementar servicios reales, devolvemos 0
		const totalServices = 0;
		const runningServices = 0;
		return { totalServers, onlineServers, totalServices, runningServices };
	}, [servers]);

	return { stats, isLoading, isError, error };
}
