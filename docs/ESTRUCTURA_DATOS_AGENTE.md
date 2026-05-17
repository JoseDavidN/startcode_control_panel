# 📡 Estructura de Datos del Agente de Monitoreo

Este documento describe la estructura completa de los datos que el agente de monitoreo envía al backend y cómo se procesan.

---

## 🔄 Flujo de Datos

```
┌─────────────┐          ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   AGENTE    │  ─────>  │  WebSocket   │  ─────>  │  PostgreSQL  │  ─────>  │   FRONTEND   │
│  (Servidor) │  Socket  │   Gateway    │  Guardar │  (Métricas)  │  REST/WS │  (Dashboard) │
└─────────────┘          └──────────────┘          └──────────────┘          └──────────────┘
```

---

## 📨 Mensaje Base del Agente

Todos los mensajes que envía el agente tienen esta estructura base:

```typescript
{
  messageId: string,          // ID único del mensaje: "msg-1234567890123"
  agentVersion: string,       // Versión del agente: "1.0.0"
  timestamp: number,          // Unix timestamp: 1705834800000
  serverId: string,           // UUID del servidor: "3c89cbc3-4378-46f0-ab3a-deb9b4a8e4eb"
  token: string,              // Token de autenticación (actualmente = serverId)
  type: AgentMessageType,     // Tipo de mensaje (ver abajo)
  data: any                   // Datos específicos del tipo de mensaje
}
```

---

## 🎯 Tipos de Mensajes

El agente puede enviar **7 tipos diferentes** de mensajes:

### 1. `HEARTBEAT` - Latido del corazón
**Propósito:** Mantener viva la conexión y notificar que el agente está activo.

**Frecuencia:** Cada 30 segundos

**Datos (`data`):**
```typescript
{} // Vacío, solo el timestamp del mensaje es relevante
```

**Procesamiento Backend:**
- Actualiza `dat_last_seen` del servidor en la BD
- No emite eventos al frontend

---

### 2. `SYSTEM_INFO` - Información del Sistema
**Propósito:** Información básica del sistema operativo y hardware.

**Frecuencia:** Al conectar y cada hora

**Datos (`data`):**
```typescript
{
  hostname: "devstar",
  platform: "linux",
  distro: "Ubuntu 24.04.3 LTS",
  kernel: "6.8.0-87-generic",
  arch: "x64",
  uptime: 226338,              // Segundos desde el último arranque
  bootTime: 1705608462000      // Unix timestamp del arranque
}
```

**Procesamiento Backend:**
- Actualiza campos del servidor en BD:
  - `str_hostname`
  - `str_os_version` (distro)
  - `str_kernel_version`
  - `dat_last_seen`
- **Emite evento WebSocket al frontend:** `server:info:updated`

---

### 3. `METRICS` - Métricas Completas 🔥 (MÁS IMPORTANTE)
**Propósito:** Métricas en tiempo real de CPU, memoria, disco, red y procesos.

**Frecuencia:** Cada 10 segundos

**Datos (`data`):**

```typescript
{
  // ═══════════════════════════════════════════════════════
  // INFORMACIÓN DEL SISTEMA
  // ═══════════════════════════════════════════════════════
  system: {
    hostname: "devstar",
    platform: "linux",
    distro: "Ubuntu 24.04.3 LTS",
    kernel: "6.8.0-87-generic",
    arch: "x64",
    uptime: 226338,
    bootTime: 1705608462000
  },

  // ═══════════════════════════════════════════════════════
  // MÉTRICAS DE CPU
  // ═══════════════════════════════════════════════════════
  cpu: {
    manufacturer: "Intel",
    brand: "Core i7-9750H",
    cores: 12,                   // Núcleos lógicos (con hyperthreading)
    physicalCores: 6,            // Núcleos físicos
    processors: 1,               // Número de procesadores
    usage: 37.5,                 // Uso total de CPU (%)
    usagePerCore: [              // Uso por núcleo (%)
      45.2, 32.1, 38.9, 41.2,
      35.7, 39.4, 36.8, 34.5,
      40.1, 33.2, 37.8, 35.9
    ],
    loadAverage: {
      current: 2.15,             // Load average 1 minuto
      avg5: 1.87,                // Load average 5 minutos
      avg15: 1.65                // Load average 15 minutos
    },
    topProcesses: [              // Top 10 procesos por CPU
      {
        pid: 1234,
        name: "node",
        cpu: 45.6,               // % de CPU
        mem: 5.2,                // % de memoria
        memVsz: 524288000,       // Memoria virtual (bytes)
        memRss: 262144000,       // Memoria residente (bytes)
        user: "root",
        command: "node /app/server.js"
      },
      // ... hasta 10 procesos
    ]
  },

  // ═══════════════════════════════════════════════════════
  // MÉTRICAS DE MEMORIA
  // ═══════════════════════════════════════════════════════
  memory: {
    total: 16777216000,          // Memoria total (bytes)
    free: 5800550400,            // Memoria libre (bytes)
    used: 10976665600,           // Memoria usada (bytes)
    available: 8123904000,       // Memoria disponible (bytes)
    usagePercent: 65.4,          // Porcentaje de uso

    // SWAP
    swapTotal: 4294967296,       // Swap total (bytes)
    swapFree: 3221225472,        // Swap libre (bytes)
    swapUsed: 1073741824,        // Swap usado (bytes)
    swapUsagePercent: 25.0,      // Porcentaje de uso del swap

    // Buffers y caché
    cached: 2147483648,          // Memoria en caché (bytes)
    buffers: 536870912           // Buffers (bytes)
  },

  // ═══════════════════════════════════════════════════════
  // MÉTRICAS DE DISCO
  // ═══════════════════════════════════════════════════════
  disk: {
    filesystems: [
      {
        fs: "/dev/nvme0n1p2",
        type: "ext4",
        size: 512110190592,       // Tamaño total (bytes)
        used: 70000000000,        // Espacio usado (bytes)
        available: 442110190592,  // Espacio disponible (bytes)
        usagePercent: 13.7,       // Porcentaje de uso
        mount: "/"
      },
      {
        fs: "/dev/sda1",
        type: "ext4",
        size: 1099511627776,
        used: 549755813888,
        available: 549755813888,
        usagePercent: 50.0,
        mount: "/mnt/data"
      }
      // ... más filesystems
    ]
  },

  // ═══════════════════════════════════════════════════════
  // MÉTRICAS DE RED
  // ═══════════════════════════════════════════════════════
  network: {
    interfaces: [
      {
        iface: "eth0",
        ip4: "192.168.1.18",
        ip6: "fe80::1",
        mac: "00:1a:2b:3c:4d:5e",
        rx_bytes: 1234567890,     // Bytes recibidos (total)
        tx_bytes: 987654321,      // Bytes transmitidos (total)
        rx_sec: 102400,           // Bytes/segundo recibidos
        tx_sec: 51200,            // Bytes/segundo transmitidos
        operstate: "up"           // Estado: up/down
      },
      {
        iface: "docker0",
        ip4: "172.17.0.1",
        ip6: "",
        mac: "02:42:ac:11:00:01",
        rx_bytes: 45678901,
        tx_bytes: 12345678,
        rx_sec: 1024,
        tx_sec: 512,
        operstate: "up"
      }
      // ... más interfaces
    ],
    connections: {
      active: 98,                 // Conexiones activas (ESTABLISHED)
      listening: 12               // Puertos escuchando (LISTEN)
    },
    publicIP: "191.109.99.119",   // IP pública (puede ser null)
    privateIPs: [                 // IPs privadas
      "192.168.1.18",
      "172.19.0.1",
      "172.17.0.1"
    ]
  }
}
```

**Procesamiento Backend:**
1. **Guarda en PostgreSQL** (`tbl_agent_metrics`):
   - CPU: usage, usage_per_core, load_average_1m/5m/15m
   - Memoria: total, used, free, available, usage_percent, swap_*
   - Disco: disk_filesystems (JSONB)
   - Red: public_ip, private_ips, connections_active/listening
   - Sistema: hostname, platform, distro, kernel, uptime, boot_time
   - Procesos: total, running, sleeping, stopped, zombie
   - Metadata: agent_version, message_id, message_type

2. **Actualiza servidor** (`tbl_servers`):
   - `dat_last_seen = NOW()`

3. **Emite evento WebSocket al frontend:** `server:metrics:realtime`
   ```typescript
   {
     serverId: "3c89cbc3-...",
     serverName: "DevStar",
     metrics: {
       cpu: 37.5,
       memory: 65.4,
       disk: 13.7,           // Del primer filesystem
       uptime: 226338
     },
     timestamp: "2025-01-21T10:30:00.000Z"
   }
   ```

---

### 4. `SERVICES_INVENTORY` - Inventario de Servicios
**Propósito:** Lista de servicios systemd y su estado.

**Frecuencia:** Cada 5 minutos

**Datos (`data`):**
```typescript
[
  {
    name: "nginx",
    displayName: "NGINX web server",
    state: "active",              // active | inactive | failed | unknown
    subState: "running",          // running | exited | dead | failed
    enabled: true,                // Arranca automáticamente
    pid: 12345,                   // PID del proceso principal (null si no corre)
    memory: 52428800,             // Memoria usada (bytes)
    cpuPercent: 2.5               // % de CPU
  },
  {
    name: "postgresql",
    displayName: "PostgreSQL Database",
    state: "active",
    subState: "running",
    enabled: true,
    pid: 23456,
    memory: 104857600,
    cpuPercent: 5.8
  },
  // ... más servicios (típicamente 50-200)
]
```

**Procesamiento Backend:**
- Actualiza métricas en BD:
  - `services_count`
  - `services_list` (JSONB)
- **Emite evento WebSocket:** `server:services:updated`

---

### 5. `PROCESSES_INVENTORY` - Inventario de Procesos
**Propósito:** Estadísticas de procesos del sistema.

**Frecuencia:** Cada minuto

**Datos (`data`):**
```typescript
{
  total: 234,                    // Total de procesos
  running: 3,                    // En ejecución
  sleeping: 228,                 // Dormidos
  stopped: 2,                    // Detenidos
  zombie: 1                      // Zombies
}
```

**Procesamiento Backend:**
- Actualiza métricas en BD:
  - `processes_total`
  - `processes_running`
  - `processes_sleeping`
  - `processes_stopped`
  - `processes_zombie`
- **Emite evento WebSocket:** `server:processes:updated`

---

### 6. `WEBSITES_INVENTORY` - Inventario de Sitios Web
**Propósito:** Lista de sitios web (nginx/apache virtual hosts).

**Frecuencia:** Cada 10 minutos

**Datos (`data`):**
```typescript
[
  {
    domain: "example.com",
    port: 80,
    ssl: false,
    configPath: "/etc/nginx/sites-enabled/example.com"
  },
  {
    domain: "secure.example.com",
    port: 443,
    ssl: true,
    certExpiry: 1736812800000,  // Unix timestamp
    configPath: "/etc/nginx/sites-enabled/secure.example.com"
  }
  // ... más sitios
]
```

**Procesamiento Backend:**
- **Emite evento WebSocket:** `server:websites:updated`
- ⚠️ **TODO:** Implementar almacenamiento en BD

---

### 7. `DATABASES_INVENTORY` - Inventario de Bases de Datos
**Propósito:** Lista de bases de datos detectadas.

**Frecuencia:** Cada 10 minutos

**Datos (`data`):**
```typescript
[
  {
    type: "postgresql",
    version: "16.1",
    databases: ["db_app", "db_analytics", "postgres"],
    size: 1073741824,           // Tamaño total (bytes)
    running: true
  },
  {
    type: "mysql",
    version: "8.0.35",
    databases: ["wordpress", "ecommerce"],
    size: 536870912,
    running: true
  }
  // ... más bases de datos
]
```

**Procesamiento Backend:**
- **Emite evento WebSocket:** `server:databases:updated`
- ⚠️ **TODO:** Implementar almacenamiento en BD

---

## 🗄️ Almacenamiento en Base de Datos

Los datos se guardan en la tabla `tbl_agent_metrics`:

```sql
CREATE TABLE tbl_agent_metrics (
  id UUID PRIMARY KEY,
  server_id UUID NOT NULL,
  timestamp TIMESTAMP NOT NULL,

  -- CPU
  cpu_usage DECIMAL(5,2),
  cpu_usage_per_core JSONB,
  cpu_load_average_1m DECIMAL(10,2),
  cpu_load_average_5m DECIMAL(10,2),
  cpu_load_average_15m DECIMAL(10,2),

  -- Memoria
  memory_total BIGINT,
  memory_used BIGINT,
  memory_free BIGINT,
  memory_available BIGINT,
  memory_usage_percent DECIMAL(5,2),
  swap_total BIGINT,
  swap_used BIGINT,
  swap_usage_percent DECIMAL(5,2),

  -- Disco
  disk_filesystems JSONB,

  -- Red
  network_public_ip VARCHAR(45),
  network_private_ips TEXT[],
  network_connections_active INTEGER,
  network_connections_listening INTEGER,

  -- Sistema
  system_hostname VARCHAR(255),
  system_platform VARCHAR(50),
  system_distro VARCHAR(100),
  system_kernel VARCHAR(100),
  system_uptime INTEGER,
  system_boot_time TIMESTAMP,

  -- Procesos
  processes_total INTEGER,
  processes_running INTEGER,
  processes_sleeping INTEGER,
  processes_stopped INTEGER,
  processes_zombie INTEGER,

  -- Servicios
  services_count INTEGER,
  services_list JSONB,

  -- Metadata
  agent_version VARCHAR(20),
  message_id VARCHAR(100),
  message_type VARCHAR(50)
);
```

---

## 📡 Eventos WebSocket al Frontend

El backend emite estos eventos en tiempo real al frontend:

### 1. `agent:connected`
```typescript
{
  serverId: "3c89cbc3-...",
  serverName: "DevStar"
}
```

### 2. `agent:disconnected`
```typescript
{
  serverId: "3c89cbc3-..."
}
```

### 3. `server:metrics:realtime` ⭐ (MÁS USADO)
```typescript
{
  serverId: "3c89cbc3-...",
  serverName: "DevStar",
  metrics: {
    cpu: 37.5,
    memory: 65.4,
    disk: 13.7,
    uptime: 226338
  },
  timestamp: "2025-01-21T10:30:00.000Z"
}
```

### 4. `server:info:updated`
```typescript
{
  serverId: "3c89cbc3-...",
  systemInfo: { /* SystemInfoDto */ }
}
```

### 5. `server:services:updated`
```typescript
{
  serverId: "3c89cbc3-...",
  services: [ /* ServiceItemDto[] */ ]
}
```

### 6. `server:processes:updated`
```typescript
{
  serverId: "3c89cbc3-...",
  processes: { total: 234, running: 3, ... }
}
```

---

## 🔌 API REST Endpoints

El frontend puede consultar datos históricos vía REST:

### 1. `GET /agent-data/servers/:id/latest`
Obtiene las métricas más recientes.

**Respuesta:**
```typescript
{
  serverId: "3c89cbc3-...",
  timestamp: "2025-01-21T10:30:00.000Z",
  cpu: { usage: 37.5, usagePerCore: [...], loadAverage: {...} },
  memory: { total: 16777216000, used: 10976665600, ... },
  disk: { filesystems: [...] },
  network: { publicIP: "191.109.99.119", ... },
  system: { hostname: "devstar", ... },
  processes: { total: 234, running: 3, ... },
  services: { count: 98, list: [...] }
}
```

### 2. `GET /agent-data/servers/:id/historical?hours=24`
Obtiene métricas históricas de las últimas N horas.

**Respuesta:**
```typescript
{
  serverId: "3c89cbc3-...",
  cpu: [
    { timestamp: "2025-01-21T09:00:00Z", value: 35.2 },
    { timestamp: "2025-01-21T09:10:00Z", value: 37.8 },
    // ... cada 10 segundos
  ],
  memory: [ /* ... */ ],
  disk: [ /* ... */ ],
  startTime: "2025-01-20T10:30:00Z",
  endTime: "2025-01-21T10:30:00Z"
}
```

### 3. `GET /agent-data/servers/:id/system-info`
Información del sistema.

### 4. `GET /agent-data/servers/:id/agent-status`
Estado de conexión del agente.

```typescript
{
  connected: true,
  lastSeen: "2025-01-21T10:30:00Z",
  agentVersion: "1.0.0"
}
```

---

## 📊 Ejemplo Completo de Flujo

1. **Agente envía métricas cada 10 segundos:**
   ```
   WebSocket: agent:message
   {
     messageId: "msg-1705834800123",
     agentVersion: "1.0.0",
     timestamp: 1705834800123,
     serverId: "3c89cbc3-...",
     token: "3c89cbc3-...",
     type: "metrics",
     data: { cpu: {...}, memory: {...}, ... }
   }
   ```

2. **Backend procesa:**
   - Autentica el mensaje
   - Guarda en PostgreSQL (`tbl_agent_metrics`)
   - Actualiza `dat_last_seen` en `tbl_servers`
   - Emite evento WebSocket a todos los clientes conectados

3. **Frontend recibe en tiempo real:**
   ```
   WebSocket: server:metrics:realtime
   {
     serverId: "3c89cbc3-...",
     serverName: "DevStar",
     metrics: { cpu: 37.5, memory: 65.4, disk: 13.7, uptime: 226338 },
     timestamp: "2025-01-21T10:30:00Z"
   }
   ```

4. **Frontend actualiza la UI:**
   - Gráficos en tiempo real
   - Tarjetas de métricas
   - Alertas si hay valores críticos

---

## 🎯 Resumen de Frecuencias

| Tipo de Mensaje         | Frecuencia   | Evento WebSocket              |
|------------------------|--------------|-------------------------------|
| `HEARTBEAT`            | 30s          | ❌ No emite                   |
| `SYSTEM_INFO`          | 1h           | `server:info:updated`         |
| `METRICS` ⭐           | 10s          | `server:metrics:realtime`     |
| `SERVICES_INVENTORY`   | 5m           | `server:services:updated`     |
| `PROCESSES_INVENTORY`  | 1m           | `server:processes:updated`    |
| `WEBSITES_INVENTORY`   | 10m          | `server:websites:updated`     |
| `DATABASES_INVENTORY`  | 10m          | `server:databases:updated`    |

---

## ✅ Conclusión

El agente envía datos muy completos cada 10 segundos. Los datos más importantes son:

- **CPU:** Uso total, por núcleo, load average, top procesos
- **Memoria:** Uso, disponible, swap
- **Disco:** Filesystems con uso
- **Red:** IPs, interfaces, conexiones activas
- **Sistema:** Hostname, distro, uptime

Todo se almacena en PostgreSQL y se emite en tiempo real al frontend vía WebSocket.
