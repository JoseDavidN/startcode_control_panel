import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

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
  status: string;
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

// Contexto
interface RealtimeMetricsContextType {
  data: RealtimeData;
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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [data, setData] = useState<RealtimeData>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Crear conexión WebSocket
    console.log('🔌 Conectando a WebSocket:', `${backendUrl}/agent`);
    const newSocket = io(`${backendUrl}/agent`, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
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
      console.log('📊 Métricas recibidas:', payload);
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          metrics: payload.metrics,
          status: 'online',
          timestamp: new Date(payload.timestamp),
          serverName: payload.serverName,
        },
      }));
    });

    // 2. Agente conectado
    newSocket.on('agent:connected', (payload: { serverId: string; serverName: string }) => {
      console.log('✅ Agente conectado:', payload);
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
      console.log('❌ Agente desconectado:', payload);
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          status: 'offline',
        },
      }));
    });

    // 4. Información del sistema actualizada
    newSocket.on('server:info:updated', (payload: any) => {
      console.log('ℹ️ Información del sistema actualizada:', payload);
      // Puedes guardar esto en el estado si lo necesitas
    });

    // 5. Servicios actualizados
    newSocket.on('server:services:updated', (payload: any) => {
      console.log('🔧 Servicios actualizados:', payload);
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
      console.log('⚙️ Procesos actualizados:', payload);
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
      console.log('🌐 Sitios web actualizados:', payload);
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
      console.log('💾 Bases de datos actualizadas:', payload);
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
  }, [backendUrl]);

  return (
    <RealtimeMetricsContext.Provider value={{ socket, data, connected }}>
      {children}
    </RealtimeMetricsContext.Provider>
  );
};

// Hook personalizado para usar el contexto
export const useRealtimeMetrics = () => {
  const context = useContext(RealtimeMetricsContext);
  if (context === undefined) {
    throw new Error('useRealtimeMetrics debe usarse dentro de RealtimeMetricsProvider');
  }
  return context;
};

// Hook para obtener métricas de un servidor específico
export const useServerMetrics = (serverId: string) => {
  const { data, connected } = useRealtimeMetrics();
  return {
    metrics: data[serverId]?.metrics,
    status: data[serverId]?.status || 'unknown',
    timestamp: data[serverId]?.timestamp,
    serverName: data[serverId]?.serverName,
    servicesCount: data[serverId]?.servicesCount,
    processesCount: data[serverId]?.processesCount,
    processes: data[serverId]?.processes,
    services: data[serverId]?.services,
    websites: data[serverId]?.websites || [],
    databases: data[serverId]?.databases || [],
    connected: connected && data[serverId]?.status === 'online',
  };
};
