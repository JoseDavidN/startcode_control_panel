// src/hooks/useMonitoring.ts
import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '@services/monitoring.api';
import { useAuth } from '@hooks/useAuth';

/** Totales de la cuenta: servicios, sitios, bases de datos, procesos y medias. */
export function useOverview() {
	const { isAuthenticated } = useAuth();

	return useQuery({
		queryKey: ['overview'],
		queryFn: () => monitoringApi.overview(),
		enabled: isAuthenticated,
		retry: false,
		staleTime: 1000 * 30,
		refetchInterval: isAuthenticated ? 1000 * 60 : false,
	});
}

/** Serie histórica ya agregada en el servidor (~120 puntos por rango). */
export function useHistorical(serverId: string | undefined, hours = 24) {
	const { isAuthenticated } = useAuth();

	return useQuery({
		queryKey: ['historical', serverId, hours],
		queryFn: () => monitoringApi.historical(serverId as string, hours),
		enabled: isAuthenticated && !!serverId,
		retry: false,
		staleTime: 1000 * 60,
	});
}

export function useServerSummary(serverId: string | undefined) {
	const { isAuthenticated } = useAuth();

	return useQuery({
		queryKey: ['server-summary', serverId],
		queryFn: () => monitoringApi.summary(serverId as string),
		enabled: isAuthenticated && !!serverId,
		retry: false,
		staleTime: 1000 * 30,
	});
}
