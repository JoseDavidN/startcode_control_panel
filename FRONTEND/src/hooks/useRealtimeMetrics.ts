import { useContext, useMemo, useSyncExternalStore } from 'react';
import { RealtimeMetricsContext } from '@contexts/realtime-metrics-context';

const useRealtimeContext = () => {
  const context = useContext(RealtimeMetricsContext);
  if (context === undefined) {
    throw new Error('useRealtimeMetrics debe usarse dentro de RealtimeMetricsProvider');
  }
  return context;
};

/** Solo el socket y su estado: no re-renderiza con los eventos de datos. */
export const useRealtimeSocket = () => {
  const { socket, connected } = useRealtimeContext();
  return { socket, connected };
};

/** Todos los servidores: re-renderiza con cualquier evento. */
export const useRealtimeMetrics = () => {
  const { store, socket, connected } = useRealtimeContext();
  const data = useSyncExternalStore(store.subscribe, store.get);
  return useMemo(() => ({ data, socket, connected }), [data, socket, connected]);
};

const EMPTY: never[] = [];

/** Un servidor: solo re-renderiza con los eventos de ese servidor. */
export const useServerMetrics = (serverId: string) => {
  const { store, connected } = useRealtimeContext();
  const entry = useSyncExternalStore(store.subscribe, () => store.get()[serverId]);

  return useMemo(() => ({
    metrics: entry?.metrics,
    status: entry?.status || 'unknown',
    timestamp: entry?.timestamp,
    serverName: entry?.serverName,
    servicesCount: entry?.servicesCount,
    processesCount: entry?.processesCount,
    processes: entry?.processes,
    services: entry?.services,
    websites: entry?.websites || EMPTY,
    databases: entry?.databases || EMPTY,
    connected: connected && entry?.status === 'online',
  }), [entry, connected]);
};
