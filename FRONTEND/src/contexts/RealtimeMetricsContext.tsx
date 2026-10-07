import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { TokenManager } from '@utils/tokenManager';
import { useAuth } from '@hooks/useAuth';

// Tipos para las métricas en tiempo real
export interface ServerMetrics {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
}

export interface ProcessInfo {
  total: number;
  running: number;
  sleeping: number;
  stopped: number;
  zombie: number;
  list?: any[];
  topList?: any[];
}

export interface ServiceInfo {
  name: string;
  /** Igual que en el agente: active | inactive | failed | unknown */
  state: string;
  pid?: number;
  uptime?: number;
  memory?: number;
  cpu?: number;
}

export interface WebsiteInfo {
  domain: string;
  port: number;
  ssl: boolean;
  configPath?: string;
  certExpiry?: number;
}

export interface DatabaseInfo {
  type: string;
  version: string;
  databases: string[];
  size: number;
  running: boolean;
}

export interface RealtimeServerData {
  metrics?: ServerMetrics;
  status: 'online' | 'offline' | 'unknown';
  timestamp?: Date;
  serverName?: string;
  servicesCount?: number;
  processesCount?: number;
  processes?: ProcessInfo;
  services?: ServiceInfo[];
  websites?: WebsiteInfo[];
  databases?: DatabaseInfo[];
  connected?: boolean;
}

export interface RealtimeData {
  [serverId: string]: RealtimeServerData;
}

/**
 * Los datos viven fuera del estado de React: con `useState` cada evento del
 * socket re-renderizaba a todos los consumidores, aunque fuese de otro
 * servidor. Con un store externo cada uno se suscribe a lo que lee
 * (`useServerMetrics` solo a su servidor) vía `useSyncExternalStore`.
 */
class RealtimeStore {
  private data: RealtimeData = {};
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  get = (): RealtimeData => this.data;

  update(fn: (prev: RealtimeData) => RealtimeData): void {
    this.data = fn(this.data);
    this.listeners.forEach(listener => listener());
  }
}

// Contexto: solo cambia al conectar/desconectar, no con cada evento.
interface RealtimeMetricsContextType {
  store: RealtimeStore;
  connected: boolean;
  socket: Socket | null;
}

const RealtimeMetricsContext = createContext<RealtimeMetricsContextType | undefined>(undefined);

// Provider
interface RealtimeMetricsProviderProps {
  children: ReactNode;
  backendUrl?: string;
}

export const RealtimeMetricsProvider: React.FC<RealtimeMetricsProviderProps> = ({
  children,
  backendUrl = 'http://localhost:3001',
}) => {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [store] = useState(() => new RealtimeStore());
  const setData = (fn: (prev: RealtimeData) => RealtimeData) => store.update(fn);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    /* Sin sesión no hay nada que escuchar (y el gateway rechazaría la conexión).
       Al iniciar o cerrar sesión el socket se rehace para viajar con el token
       correcto. */
    if (!isAuthenticated) {
      setConnected(false);
      setData(() => ({}));
      return;
    }

    // Crear conexión WebSocket
    console.log('🔌 Conectando a WebSocket:', `${backendUrl}/agent`);
    /* El token identifica al panel y lo mete en la room de su usuario: antes el
       gateway emitía en difusión y este cliente recibía las métricas de todos
       los servidores, incluidos los de otras cuentas. */
    const newSocket = io(`${backendUrl}/agent`, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: { token: TokenManager.getAccessToken() },
    });

    // Eventos de conexión
    newSocket.on('connect', () => {
      console.log('✅ Conectado a WebSocket');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Desconectado de WebSocket');
      setConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Error de conexión WebSocket:', error.message);
      setConnected(false);
    });

    // Eventos de datos del agente

    // 1. Métricas en tiempo real
    newSocket.on('server:metrics:realtime', (payload: any) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          /* Sin el merge, cada tick de métricas (30 s) borraba servicios,
             sitios, bases y procesos de este servidor, y los contadores de la
             lista volvían a cero hasta el siguiente inventario. */
          ...prev[payload.serverId],
          metrics: payload.metrics,
          status: 'online',
          timestamp: new Date(payload.timestamp),
          serverName: payload.serverName,
        },
      }));
    });

    // 2. Agente conectado
    newSocket.on('agent:connected', (payload: { serverId: string; serverName: string }) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          status: 'online',
          serverName: payload.serverName,
        },
      }));
    });

    // 3. Agente desconectado
    newSocket.on('agent:disconnected', (payload: { serverId: string }) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          status: 'offline',
        },
      }));
    });

    // 5. Servicios actualizados
    newSocket.on('server:services:updated', (payload: any) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          servicesCount: Array.isArray(payload.services) ? payload.services.length : 0,
          services: Array.isArray(payload.services) ? payload.services : [],
        },
      }));
    });

    // 6. Procesos actualizados
    newSocket.on('server:processes:updated', (payload: any) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          processesCount: payload.processes?.total || 0,
          processes: payload.processes || null,
        },
      }));
    });

    // 7. Sitios web actualizados
    newSocket.on('server:websites:updated', (payload: any) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          websites: Array.isArray(payload.websites) ? payload.websites : [],
        },
      }));
    });

    // 8. Bases de datos actualizadas
    newSocket.on('server:databases:updated', (payload: any) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          databases: Array.isArray(payload.databases) ? payload.databases : [],
        },
      }));
    });

    setSocket(newSocket);

    // Cleanup al desmontar
    return () => {
      console.log('🔌 Cerrando conexión WebSocket');
      newSocket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `setData` solo envuelve al store, que es estable
  }, [backendUrl, isAuthenticated]);

  const value = useMemo(() => ({ store, socket, connected }), [store, socket, connected]);

  return (
    <RealtimeMetricsContext.Provider value={value}>
      {children}
    </RealtimeMetricsContext.Provider>
  );
};

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
