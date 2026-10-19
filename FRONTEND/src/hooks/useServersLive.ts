import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { monitoringApi } from '@services/monitoring.api';
import { useRealtimeMetrics } from '@hooks/useRealtimeMetrics';
import { mergeServerRuntime, type ServerRuntime } from '@lib/serverRuntime';

/**
 * Los eventos que cambian lo que muestra la lista y obligan a releer. Los de
 * inventario (servicios, sitios, bases, procesos) no: `mergeServerRuntime` ya
 * los aplica desde el socket, y releer era pedir dos veces lo mismo al backend
 * en cada ciclo del agente.
 */
const INVALIDATING_EVENTS = ['agent:connected', 'agent:disconnected'] as const;

/* Al reiniciar el backend todos los agentes reconectan a la vez: sin esto
   serían N refetch en el mismo segundo. */
const INVALIDATE_DEBOUNCE_MS = 1000;

/**
 * Estado en vivo de todos los servidores: instantánea HTTP + eventos del
 * socket, mezclados **en lectura**.
 *
 * La caché de React Query guarda solo lo que devuelve el backend y el contexto
 * solo lo que llega por el socket; ninguno escribe en el otro. Con dos
 * escritores sobre la misma caché, cada refetch rebobinaría la interfaz.
 */
export function useServersLive() {
	const queryClient = useQueryClient();
	const { data: liveData, socket, connected } = useRealtimeMetrics();

	const query = useQuery({
		queryKey: ['servers-summary'],
		queryFn: () => monitoringApi.serversSummary(),
		staleTime: 15_000,
		/* Con el socket conectado los datos ya llegan en vivo: el sondeo queda
		   como red de seguridad. */
		refetchInterval: connected ? 5 * 60_000 : 60_000,
		refetchOnWindowFocus: true,
		retry: false,
	});

	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!socket) return;

		const invalidate = () => {
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(() => {
				void queryClient.invalidateQueries({ queryKey: ['servers-summary'] });
				/* El estado persistido del servidor también cambia al conectarse o
				   caerse el agente. */
				void queryClient.invalidateQueries({ queryKey: ['servers'] });
			}, INVALIDATE_DEBOUNCE_MS);
		};

		INVALIDATING_EVENTS.forEach(event => socket.on(event, invalidate));

		return () => {
			INVALIDATING_EVENTS.forEach(event => socket.off(event, invalidate));
			if (timer.current) clearTimeout(timer.current);
		};
		/* `server:metrics:realtime` NO entra aquí a propósito: llega cada 30 s por
		   servidor y el merge ya lo aplica sin pedir nada al backend. */
	}, [socket, queryClient]);

	const runtime = useMemo(() => {
		const now = Date.now();
		const map: Record<string, ServerRuntime> = {};

		for (const snapshot of query.data?.servers ?? []) {
			map[snapshot.serverId] = mergeServerRuntime(
				snapshot,
				liveData[snapshot.serverId],
				snapshot.status,
				now,
			);
		}

		return map;
	}, [query.data, liveData]);

	const onlineCount = useMemo(
		() => Object.values(runtime).filter(r => r.state === 'online').length,
		[runtime],
	);

	return {
		runtime,
		onlineCount,
		isLoading: query.isLoading,
		isError: query.isError,
		refresh: async () => {
			await Promise.all([
				queryClient.refetchQueries({ queryKey: ['servers'] }),
				queryClient.refetchQueries({ queryKey: ['servers-summary'] }),
			]);
		},
	};
}
