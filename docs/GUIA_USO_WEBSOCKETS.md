# Guía de Uso - Sistema de Métricas en Tiempo Real con WebSockets

## ✅ Integración Completada

El sistema de monitoreo en tiempo real ha sido completamente integrado en el frontend. Ahora el panel recibe métricas actualizadas automáticamente desde el agente sin necesidad de SSH.

---

## 🚀 Características Implementadas

### 1. **Contexto Global de Métricas**
- **Archivo**: `FRONTEND/src/contexts/RealtimeMetricsContext.tsx`
- Gestiona la conexión WebSocket con el backend
- Almacena métricas en tiempo real de todos los servidores
- Proporciona hooks para acceder a las métricas desde cualquier componente

### 2. **Componentes Actualizados**

#### ServerCard (Tarjeta de Servidor)
- Muestra métricas en tiempo real si están disponibles
- Indicador visual de conexión (icono WiFi parpadeante cuando está conectado)
- Actualización automática de CPU, RAM, Disco y Uptime
- Transiciones suaves entre valores

#### ServerDetail (Vista Detallada)
- Badge "En tiempo real" cuando el agente está conectado
- Badge "Datos históricos" cuando usa datos almacenados
- Métricas principales actualizadas en tiempo real
- Animaciones suaves en las barras de progreso

### 3. **Provider Global**
- Integrado en `FRONTEND/src/provider/AppProviders.tsx`
- Conecta automáticamente al WebSocket del backend al cargar la aplicación
- Maneja reconexiones automáticas

---

## 📡 Eventos WebSocket

El frontend escucha los siguientes eventos del backend:

| Evento | Descripción | Frecuencia |
|--------|-------------|------------|
| `server:metrics:realtime` | Métricas actualizadas (CPU, RAM, Disco, Uptime) | Cada 30-60 segundos |
| `agent:connected` | Agente se conectó | Al conectar |
| `agent:disconnected` | Agente se desconectó | Al desconectar |
| `server:info:updated` | Información del sistema actualizada | Variable |
| `server:services:updated` | Inventario de servicios | Variable |
| `server:processes:updated` | Inventario de procesos | Variable |

---

## 🎯 Cómo Funciona

### Flujo de Datos

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Agente    │────────>│   Backend    │────────>│   Frontend   │
│  (Servidor) │ WebSocket│   NestJS     │ Socket.IO│   React     │
└─────────────┘         └──────────────┘         └──────────────┘
     |                         |                         |
     | Envía métricas          | Procesa y emite        | Actualiza UI
     | cada 30-60s             | eventos en tiempo real  | automáticamente
```

### 1. **Agente se Conecta**
1. El agente en el servidor establece conexión WebSocket con el backend
2. Backend autentica el agente usando su token (serverId)
3. Backend emite evento `agent:connected` al frontend
4. Frontend muestra indicador "En tiempo real" y actualiza el estado a "online"

### 2. **Métricas en Tiempo Real**
1. El agente envía métricas cada 30-60 segundos
2. Backend guarda en base de datos (PostgreSQL)
3. Backend emite evento `server:metrics:realtime` al frontend
4. Frontend actualiza la UI automáticamente con animaciones suaves

### 3. **Agente se Desconecta**
1. Conexión WebSocket se cierra
2. Backend detecta desconexión
3. Backend emite evento `agent:disconnected`
4. Frontend cambia estado a "offline" y muestra "Datos históricos"

---

## 💻 Uso en Componentes

### Usar métricas en tiempo real en un componente personalizado

```typescript
import { useServerMetrics } from '../contexts/RealtimeMetricsContext';

const MiComponente = ({ serverId }: { serverId: string }) => {
  // Obtener métricas del servidor
  const { metrics, status, connected, timestamp } = useServerMetrics(serverId);

  return (
    <div>
      {connected && status === 'online' ? (
        <div>
          <p>CPU: {metrics?.cpu}%</p>
          <p>RAM: {metrics?.memory}%</p>
          <p>Disco: {metrics?.disk}%</p>
          <p>Uptime: {metrics?.uptime}s</p>
          <span className="text-green-400">🟢 En tiempo real</span>
        </div>
      ) : (
        <span className="text-gray-400">⚪ Desconectado</span>
      )}
    </div>
  );
};
```

### Acceder a todos los servidores

```typescript
import { useRealtimeMetrics } from '../contexts/RealtimeMetricsContext';

const Dashboard = () => {
  const { data, connected } = useRealtimeMetrics();

  return (
    <div>
      <p>Conexión WebSocket: {connected ? '🟢 Conectado' : '🔴 Desconectado'}</p>

      {Object.entries(data).map(([serverId, serverData]) => (
        <div key={serverId}>
          <h3>{serverData.serverName || serverId}</h3>
          <p>Estado: {serverData.status}</p>
          <p>CPU: {serverData.metrics?.cpu}%</p>
        </div>
      ))}
    </div>
  );
};
```

---

## ⚙️ Configuración

### Variables de Entorno

Asegúrate de tener configurada la URL del backend en tu archivo `.env`:

```env
# Frontend (.env)
VITE_API_URL=http://localhost:3001
```

```env
# Backend (.env)
PORT=3001
```

### Puerto del WebSocket

El WebSocket del backend escucha en el mismo puerto que la API REST pero en el namespace `/agent`:
- URL: `ws://localhost:3001/agent`
- Protocolo: WebSocket
- Transporte: websocket (sin fallback a polling)

---

## 🔍 Debugging

### Ver eventos WebSocket en la consola

Abre las DevTools del navegador y ve a la pestaña Console. Verás logs como:

```
🔌 Conectando a WebSocket: http://localhost:3001/agent
✅ Conectado a WebSocket
📊 Métricas recibidas: { serverId: "abc123", metrics: {...} }
✅ Agente conectado: { serverId: "abc123", serverName: "Mi Servidor" }
```

### Verificar conexión WebSocket

En Chrome DevTools:
1. Ve a Network
2. Filtra por WS (WebSocket)
3. Deberías ver una conexión activa a `/agent`

### Eventos del Backend

En la terminal del backend verás logs como:

```
🚀 Agent WebSocket Gateway inicializado
📡 Escuchando en: ws://localhost:3001/agent
🔌 Nuevo cliente conectando: <socket-id>
✅ Agente autenticado: Mi Servidor (abc123)
📊 Métricas recibidas: Mi Servidor - CPU: 45.2%
```

---

## 🎨 Indicadores Visuales

### Indicador de Conexión en Tiempo Real

**ServerCard:**
- Icono WiFi verde parpadeante = Conectado en tiempo real
- Icono WiFi Off gris = Desconectado

**ServerDetail:**
- Badge verde "En tiempo real" = Métricas actualizadas automáticamente
- Badge gris "Datos históricos" = Usando última información almacenada

### Animaciones

- **Barras de progreso**: Transición suave de 500ms al cambiar valores
- **Icono WiFi**: Animación `pulse` cuando está conectado
- **Números**: Cambio automático sin parpadeos

---

## 📊 Endpoints REST Disponibles

Además del WebSocket, puedes consultar datos históricos:

```typescript
// Obtener últimas métricas
GET /agent-data/servers/:id/latest

// Obtener métricas históricas (últimas 24 horas)
GET /agent-data/servers/:id/historical?hours=24

// Obtener información del sistema
GET /agent-data/servers/:id/system-info

// Obtener estado de conexión del agente
GET /agent-data/servers/:id/agent-status

// Estadísticas de almacenamiento
GET /agent-data/storage-stats
```

**Nota:** Todos los endpoints requieren autenticación JWT.

---

## 🐛 Solución de Problemas

### El frontend no recibe métricas

1. **Verifica que el backend esté corriendo**
   ```bash
   cd BACKEND
   pnpm run start:dev
   ```

2. **Verifica que el agente esté conectado**
   - Revisa los logs del backend
   - Deberías ver "✅ Agente autenticado: ..."

3. **Verifica la conexión WebSocket en el navegador**
   - DevTools > Network > WS
   - Debe haber una conexión activa a `/agent`

### El indicador siempre muestra "Datos históricos"

1. **Revisa la consola del navegador**
   - ¿Hay errores de conexión?
   - ¿Ves el mensaje "✅ Conectado a WebSocket"?

2. **Verifica la URL del backend**
   - Asegúrate de que `VITE_API_URL` esté correcta en `.env`

3. **Revisa CORS**
   - El backend debe permitir conexiones desde el frontend
   - Verifica `AgentGateway` en `agent.gateway.ts`

### Las métricas no se actualizan

1. **Verifica que el agente esté enviando datos**
   - Revisa logs del agente
   - Debe enviar métricas cada 30-60 segundos

2. **Revisa los logs del backend**
   - Deberías ver "📊 Métricas recibidas: ..."

3. **Verifica que el evento llegue al frontend**
   - Consola del navegador debe mostrar "📊 Métricas recibidas: ..."

---

## 📚 Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────┐
│                        FRONTEND                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  RealtimeMetricsProvider (Contexto Global)         │  │
│  │  - Conecta a ws://localhost:3001/agent             │  │
│  │  - Escucha eventos del backend                     │  │
│  │  - Almacena estado global de métricas              │  │
│  └────────────────────────────────────────────────────┘  │
│                          ↓                                │
│  ┌────────────────────┐     ┌─────────────────────────┐  │
│  │   ServerCard       │     │    ServerDetail         │  │
│  │  - useServerMetrics│     │  - useServerMetrics     │  │
│  │  - Actualiza UI    │     │  - Indicadores visuales │  │
│  └────────────────────┘     └─────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                          ↑
                   Socket.IO Client
                          ↓
┌──────────────────────────────────────────────────────────┐
│                        BACKEND                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  AgentGateway                                      │  │
│  │  - Namespace: /agent                               │  │
│  │  - Autentica agentes                               │  │
│  │  - Recibe métricas                                 │  │
│  │  - Emite eventos al frontend                       │  │
│  └────────────────────────────────────────────────────┘  │
│                          ↑                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │  AgentDataService                                  │  │
│  │  - Guarda métricas en PostgreSQL                   │  │
│  │  - Provee endpoints REST para datos históricos     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                          ↑
                   WebSocket (agent:message)
                          ↓
┌──────────────────────────────────────────────────────────┐
│                    AGENTE (Servidor)                      │
│  - Recopila métricas del sistema                         │
│  - Envía cada 30-60 segundos                             │
│  - Conecta a ws://backend:3001/agent                     │
└──────────────────────────────────────────────────────────┘
```

---

## ✅ Checklist de Funcionamiento

- [ ] Backend corriendo en puerto 3001
- [ ] Frontend corriendo (npm run dev / pnpm dev)
- [ ] Variable `VITE_API_URL` configurada correctamente
- [ ] WebSocket conectado (ver consola del navegador)
- [ ] Agente enviando métricas (ver logs del backend)
- [ ] Indicador "En tiempo real" visible en el frontend
- [ ] Métricas actualizándose automáticamente

---

## 🎉 ¡Listo!

El sistema de métricas en tiempo real está completamente funcional. Las métricas se actualizan automáticamente sin necesidad de refrescar la página ni hacer polling manual.

Para cualquier pregunta o problema, revisa los logs del backend y la consola del navegador.
