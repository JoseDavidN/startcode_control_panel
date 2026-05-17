# Integración Frontend - WebSockets en Tiempo Real

## Configuración del Cliente Socket.IO

### Instalación
```bash
npm install socket.io-client
# o
yarn add socket.io-client
```

### Conexión al Gateway

```typescript
import { io, Socket } from 'socket.io-client';

// Conectar al namespace del agente
const socket: Socket = io('http://localhost:3001/agent', {
  transports: ['websocket'],
  autoConnect: true,
});

// Manejar conexión
socket.on('connect', () => {
  console.log('✅ Conectado al servidor WebSocket');
});

// Manejar desconexión
socket.on('disconnect', () => {
  console.log('❌ Desconectado del servidor WebSocket');
});

// Manejar errores
socket.on('error', (error) => {
  console.error('Error en WebSocket:', error);
});
```

## Eventos Disponibles

### 1. Métricas en Tiempo Real
Se emiten cada vez que un agente envía métricas (típicamente cada 30-60 segundos).

```typescript
socket.on('server:metrics:realtime', (data) => {
  console.log('📊 Métricas recibidas:', data);

  // Estructura de data:
  // {
  //   serverId: string,
  //   serverName: string,
  //   metrics: {
  //     cpu: number,        // % de uso de CPU
  //     memory: number,     // % de uso de memoria
  //     disk: number,       // % de uso de disco
  //     uptime: number      // Tiempo de actividad en segundos
  //   },
  //   timestamp: Date
  // }

  // Actualizar UI con las nuevas métricas
  updateServerMetrics(data.serverId, data.metrics);
});
```

### 2. Agente Conectado
Se emite cuando un agente se conecta al backend.

```typescript
socket.on('agent:connected', (data) => {
  console.log('✅ Agente conectado:', data);

  // Estructura de data:
  // {
  //   serverId: string,
  //   serverName: string
  // }

  // Actualizar UI para mostrar servidor como "online"
  setServerStatus(data.serverId, 'online');
  showNotification(`${data.serverName} está ahora en línea`);
});
```

### 3. Agente Desconectado
Se emite cuando un agente se desconecta del backend.

```typescript
socket.on('agent:disconnected', (data) => {
  console.log('❌ Agente desconectado:', data);

  // Estructura de data:
  // {
  //   serverId: string
  // }

  // Actualizar UI para mostrar servidor como "offline"
  setServerStatus(data.serverId, 'offline');
  showNotification(`Servidor desconectado`);
});
```

### 4. Información del Sistema Actualizada
Se emite cuando el agente envía información del sistema.

```typescript
socket.on('server:info:updated', (data) => {
  console.log('ℹ️ Información del sistema actualizada:', data);

  // Estructura de data:
  // {
  //   serverId: string,
  //   systemInfo: {
  //     hostname: string,
  //     distro: string,
  //     kernel: string,
  //     ... más campos
  //   }
  // }

  // Actualizar información del servidor en la UI
  updateServerInfo(data.serverId, data.systemInfo);
});
```

### 5. Servicios Actualizados
Se emite cuando el agente envía inventario de servicios.

```typescript
socket.on('server:services:updated', (data) => {
  console.log('🔧 Servicios actualizados:', data);

  // Estructura de data:
  // {
  //   serverId: string,
  //   services: {
  //     // Datos de servicios del agente
  //   }
  // }

  // Actualizar lista de servicios en la UI
  updateServerServices(data.serverId, data.services);
});
```

### 6. Procesos Actualizados
Se emite cuando el agente envía inventario de procesos.

```typescript
socket.on('server:processes:updated', (data) => {
  console.log('⚙️ Procesos actualizados:', data);

  // Estructura de data:
  // {
  //   serverId: string,
  //   processes: {
  //     // Datos de procesos del agente
  //   }
  // }

  // Actualizar lista de procesos en la UI
  updateServerProcesses(data.serverId, data.processes);
});
```

### 7. Sitios Web Actualizados
Se emite cuando el agente envía inventario de sitios web.

```typescript
socket.on('server:websites:updated', (data) => {
  console.log('🌐 Sitios web actualizados:', data);

  // Estructura de data:
  // {
  //   serverId: string,
  //   websites: {
  //     // Datos de sitios web del agente
  //   }
  // }
});
```

### 8. Bases de Datos Actualizadas
Se emite cuando el agente envía inventario de bases de datos.

```typescript
socket.on('server:databases:updated', (data) => {
  console.log('💾 Bases de datos actualizadas:', data);

  // Estructura de data:
  // {
  //   serverId: string,
  //   databases: {
  //     // Datos de bases de datos del agente
  //   }
  // }
});
```

## Ejemplo de Implementación Completa

### React Hook Personalizado

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface ServerMetrics {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
}

interface RealtimeData {
  [serverId: string]: {
    metrics: ServerMetrics;
    status: 'online' | 'offline';
    timestamp: Date;
  };
}

export const useRealtimeMetrics = (backendUrl: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [data, setData] = useState<RealtimeData>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Crear conexión
    const newSocket = io(`${backendUrl}/agent`, {
      transports: ['websocket'],
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

    // Eventos de datos
    newSocket.on('server:metrics:realtime', (payload) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          metrics: payload.metrics,
          status: 'online',
          timestamp: new Date(payload.timestamp),
        },
      }));
    });

    newSocket.on('agent:connected', (payload) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          status: 'online',
        },
      }));
    });

    newSocket.on('agent:disconnected', (payload) => {
      setData((prev) => ({
        ...prev,
        [payload.serverId]: {
          ...prev[payload.serverId],
          status: 'offline',
        },
      }));
    });

    setSocket(newSocket);

    // Cleanup
    return () => {
      newSocket.close();
    };
  }, [backendUrl]);

  return { socket, data, connected };
};
```

### Uso en Componente

```typescript
import React from 'react';
import { useRealtimeMetrics } from './hooks/useRealtimeMetrics';

const ServerDashboard: React.FC = () => {
  const { data, connected } = useRealtimeMetrics('http://localhost:3001');

  return (
    <div>
      <h1>Dashboard de Servidores</h1>
      <p>Estado WebSocket: {connected ? '🟢 Conectado' : '🔴 Desconectado'}</p>

      {Object.entries(data).map(([serverId, serverData]) => (
        <div key={serverId}>
          <h2>Servidor {serverId}</h2>
          <p>Estado: {serverData.status}</p>
          <p>CPU: {serverData.metrics?.cpu}%</p>
          <p>Memoria: {serverData.metrics?.memory}%</p>
          <p>Disco: {serverData.metrics?.disk}%</p>
          <p>Última actualización: {serverData.timestamp?.toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
};

export default ServerDashboard;
```

## Endpoints REST Disponibles

Además de los eventos en tiempo real, tienes estos endpoints REST:

### Obtener Métricas Más Recientes
```
GET /agent-data/servers/:id/latest
```

### Obtener Métricas Históricas
```
GET /agent-data/servers/:id/historical?hours=24
```

### Obtener Información del Sistema
```
GET /agent-data/servers/:id/system-info
```

### Obtener Estado de Conexión del Agente
```
GET /agent-data/servers/:id/agent-status
```

### Obtener Estadísticas de Almacenamiento
```
GET /agent-data/storage-stats
```

## Notas de Seguridad

1. **Autenticación**: Todos los endpoints REST requieren autenticación JWT (Bearer token)
2. **CORS**: El WebSocket está configurado con `origin: '*'` - modifica esto en producción
3. **Tokens de Agente**: Actualmente se usa el serverId como token simple - considera implementar JWT para agentes

## Variables de Entorno

```env
# Backend URL (puerto del backend NestJS)
PORT=3001

# Frontend debe conectarse a este URL
WEBSOCKET_URL=http://localhost:3001
```
