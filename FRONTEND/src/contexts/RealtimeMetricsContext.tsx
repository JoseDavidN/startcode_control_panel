import React, { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { TokenManager } from '@utils/tokenManager';
import { apiService } from '@services/api.service';
import { useAuth } from '@hooks/useAuth';
import {
  RealtimeMetricsContext,
  RealtimeStore,
  type AgentConnectedPayload,
  type AgentDisconnectedPayload,
  type DatabasesUpdatedPayload,
  type MetricsRealtimePayload,
  type ProcessesUpdatedPayload,
  type RealtimeData,
  type ServicesUpdatedPayload,
  type WebsitesUpdatedPayload,
} from '@contexts/realtime-metrics-context';

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
    /* `auth` como función: cada intento de conexión lleva el token vigente. Con
       un objeto fijo, tras reiniciarse el backend (en desarrollo, con cada
       cambio) el socket volvía con el token de cuando se creó; si ya había
       caducado (30 min), el gateway lo rechazaba y no llegaba ningún evento en
       vivo: ni el progreso de las instalaciones, ni avisos, ni métricas.
       Sin límite de intentos: el backend puede tardar en volver. */
    const newSocket = io(`${backendUrl}/agent`, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      auth: cb => cb({ token: TokenManager.getAccessToken() }),
    });

    /* El gateway cierra la conexión si el token caducó («io server disconnect»)
       y socket.io no reintenta por sí solo en ese caso. Una petición autenticada
       renueva el token (el interceptor de apiService lo refresca al recibir 401)
       y se vuelve a conectar con el nuevo. */
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    const reconnectWithFreshToken = () => {
      clearTimeout(renewTimer);
      renewTimer = setTimeout(() => {
        void apiService.get('/auth/me')
          .catch(() => undefined)
          .finally(() => { if (!newSocket.connected) newSocket.connect(); });
      }, 1500);
    };

    // Eventos de conexión
    newSocket.on('connect', () => {
      console.log('✅ Conectado a WebSocket');
      setConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Desconectado de WebSocket:', reason);
      setConnected(false);
      if (reason === 'io server disconnect') reconnectWithFreshToken();
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Error de conexión WebSocket:', error.message);
      setConnected(false);
    });

    // Eventos de datos del agente

    // 1. Métricas en tiempo real
    newSocket.on('server:metrics:realtime', (payload: MetricsRealtimePayload) => {
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
    newSocket.on('agent:connected', (payload: AgentConnectedPayload) => {
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
    newSocket.on('agent:disconnected', (payload: AgentDisconnectedPayload) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          status: 'offline',
        },
      }));
    });

    // 5. Servicios actualizados
    newSocket.on('server:services:updated', (payload: ServicesUpdatedPayload) => {
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
    newSocket.on('server:processes:updated', (payload: ProcessesUpdatedPayload) => {
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
    newSocket.on('server:websites:updated', (payload: WebsitesUpdatedPayload) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          websites: Array.isArray(payload.websites) ? payload.websites : [],
        },
      }));
    });

    // 8. Bases de datos actualizadas
    newSocket.on('server:databases:updated', (payload: DatabasesUpdatedPayload) => {
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
      clearTimeout(renewTimer);
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
