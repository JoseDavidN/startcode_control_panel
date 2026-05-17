# Alternativas para Mejorar el Sistema de Monitoreo

## Problema Actual
- Comandos SSH fallan intermitentemente
- Parsing de salida de comandos es frágil
- Diferentes distribuciones Linux tienen diferentes formatos de salida
- Conexiones SSH son lentas y consumen recursos

---

## 🎯 Enfoque 1: Agente de Monitoreo (RECOMENDADO)

### Descripción
Instalar un agente ligero en cada servidor que exponga métricas vía HTTP/API.

### Ventajas
✅ **Más confiable**: No depende de SSH
✅ **Más rápido**: HTTP es más rápido que SSH
✅ **Formato consistente**: JSON estructurado
✅ **Menos carga**: El agente hace el trabajo pesado
✅ **Métricas en tiempo real**: El agente puede mantener historial
✅ **Seguro**: Token de autenticación simple

### Desventajas
❌ Requiere instalar software en cada servidor
❌ Necesita puerto abierto (configurable)

### Implementación

#### 1. Agente Simple en Node.js (para instalar en servidores)

```javascript
// server-agent.js - Instalar en cada servidor monitoreado
const express = require('express');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.AGENT_PORT || 9100;
const AUTH_TOKEN = process.env.AGENT_TOKEN || 'your-secret-token';

// Middleware de autenticación
app.use((req, res, next) => {
  const token = req.headers['authorization'];
  if (token !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Endpoint de métricas
app.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date(),
      hostname: os.hostname(),

      // CPU
      cpu: {
        usage: await getCpuUsage(),
        cores: os.cpus().length,
        loadAverage: os.loadavg(),
      },

      // Memoria
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024)), // MB
        free: Math.round(os.freemem() / (1024 * 1024)),
        used: Math.round((os.totalmem() - os.freemem()) / (1024 * 1024)),
        usagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
      },

      // Disco
      disk: await getDiskUsage(),

      // Red
      network: {
        interfaces: os.networkInterfaces(),
      },

      // Sistema
      system: {
        platform: os.platform(),
        release: os.release(),
        uptime: os.uptime(),
      },
    };

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Función para obtener uso de CPU
async function getCpuUsage() {
  try {
    const { stdout } = await execPromise("top -bn1 | grep 'Cpu(s)' | awk '{print 100 - $8}'");
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

// Función para obtener uso de disco
async function getDiskUsage() {
  try {
    const { stdout } = await execPromise("df -BG / | tail -1 | awk '{print $2, $3, $4, $5}'");
    const [total, used, free, percent] = stdout.trim().split(/\s+/);
    return {
      total: parseInt(total.replace('G', '')),
      used: parseInt(used.replace('G', '')),
      free: parseInt(free.replace('G', '')),
      usagePercent: parseInt(percent.replace('%', '')),
      mountPoint: '/',
    };
  } catch {
    return { total: 0, used: 0, free: 0, usagePercent: 0, mountPoint: '/' };
  }
}

app.listen(PORT, () => {
  console.log(`Agente de monitoreo escuchando en puerto ${PORT}`);
});
```

#### 2. Instalación del Agente

```bash
# En cada servidor a monitorear
cd /opt
git clone https://github.com/tu-repo/server-agent.git
cd server-agent
npm install
pm2 start server-agent.js --name monitoring-agent
pm2 save
pm2 startup
```

#### 3. Backend Modificado

```typescript
// BACKEND/src/monitoring/services/agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Server } from '../../servers/entities/server.entity';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  async getMetrics(server: Server): Promise<any> {
    try {
      const response = await axios.get(
        `http://${server.str_host}:${server.agent_port || 9100}/metrics`,
        {
          headers: {
            Authorization: `Bearer ${server.agent_token}`,
          },
          timeout: 5000, // 5 segundos
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Error obteniendo métricas del agente: ${error.message}`);
      throw error;
    }
  }
}
```

---

## 🔄 Enfoque 2: Usar Node Exporter + Prometheus (Solución Empresarial)

### Descripción
Usar herramientas estándar de la industria para monitoreo.

### Componentes
1. **Node Exporter**: Agente que expone métricas del sistema
2. **Prometheus**: Base de datos de series temporales
3. **Tu Backend**: Consulta Prometheus vía API

### Ventajas
✅ Solución probada en producción
✅ Métricas detalladas y precisas
✅ Historial de métricas
✅ Alertas integradas
✅ Dashboards con Grafana

### Instalación

```bash
# En cada servidor
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xvfz node_exporter-1.7.0.linux-amd64.tar.gz
cd node_exporter-1.7.0.linux-amd64
./node_exporter &

# Métricas disponibles en http://servidor:9100/metrics
```

### Backend para consultar Node Exporter

```typescript
// BACKEND/src/monitoring/services/node-exporter.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class NodeExporterService {
  async getMetrics(serverHost: string): Promise<any> {
    const response = await axios.get(`http://${serverHost}:9100/metrics`);
    const metrics = this.parsePrometheusMetrics(response.data);

    return {
      cpu: {
        usage: this.calculateCpuUsage(metrics),
        cores: metrics['node_cpu_seconds_total'].length,
      },
      memory: {
        total: metrics['node_memory_MemTotal_bytes'] / (1024 * 1024),
        free: metrics['node_memory_MemFree_bytes'] / (1024 * 1024),
        usagePercent: ((metrics['node_memory_MemTotal_bytes'] - metrics['node_memory_MemFree_bytes']) / metrics['node_memory_MemTotal_bytes']) * 100,
      },
      disk: {
        usagePercent: (1 - (metrics['node_filesystem_avail_bytes'] / metrics['node_filesystem_size_bytes'])) * 100,
      },
    };
  }

  private parsePrometheusMetrics(text: string): any {
    // Parser simple de métricas Prometheus
    const metrics = {};
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;

      const [key, value] = line.split(' ');
      metrics[key] = parseFloat(value);
    }

    return metrics;
  }
}
```

---

## 🛠️ Enfoque 3: Mejorar Comandos SSH Actuales (Solución Rápida)

### Descripción
Si no puedes instalar agentes, mejora los comandos SSH para ser más robustos.

### Mejoras Críticas

#### 1. Comandos Universales (Compatibles con todas las distribuciones)

```typescript
// Mejores comandos que funcionan en todas las distribuciones
export class ImprovedMetricsService {

  // CPU - Comando más confiable
  async getCpuMetrics(server: Server): Promise<CpuMetricsDto> {
    const commands = [
      // Método 1: top
      "top -bn2 -d 0.5 | grep '^%Cpu' | tail -1 | awk '{print 100-$8}'",
      // Método 2: mpstat (fallback)
      "mpstat 1 1 | tail -1 | awk '{print 100-$NF}'",
      // Método 3: /proc/stat (último recurso)
      "cat /proc/stat | grep '^cpu ' | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'",
    ];

    // Intentar comandos en orden hasta que uno funcione
    for (const cmd of commands) {
      try {
        const result = await this.sshService.executeCommand(server, cmd);
        const usage = parseFloat(result.stdout.trim());
        if (!isNaN(usage) && usage >= 0 && usage <= 100) {
          return {
            usage: Math.round(usage * 100) / 100,
            cores: await this.getCpuCores(server),
            loadAverage: await this.getLoadAverage(server),
          };
        }
      } catch (error) {
        this.logger.warn(`Comando falló: ${cmd}, intentando siguiente...`);
      }
    }

    // Si todos fallan, retornar valor por defecto
    return { usage: 0, cores: 1, loadAverage: '0, 0, 0' };
  }

  // Memoria - Usar /proc/meminfo (universal)
  async getMemoryMetrics(server: Server): Promise<MemoryMetricsDto> {
    try {
      const cmd = `awk '/MemTotal|MemAvailable/ {print $2}' /proc/meminfo`;
      const result = await this.sshService.executeCommand(server, cmd);
      const [total, available] = result.stdout.trim().split('\n').map(v => parseInt(v));

      if (!isNaN(total) && !isNaN(available)) {
        const used = total - available;
        return {
          total: Math.round(total / 1024), // KB to MB
          used: Math.round(used / 1024),
          free: Math.round(available / 1024),
          usagePercent: Math.round((used / total) * 100),
        };
      }
    } catch (error) {
      this.logger.warn(`Error en memoria: ${error.message}`);
    }

    return { total: 0, used: 0, free: 0, usagePercent: 0 };
  }

  // Disco - Comando más robusto
  async getDiskMetrics(server: Server): Promise<DiskMetricsDto[]> {
    try {
      // Usar df con formato POSIX
      const cmd = `df -k / | tail -1 | awk '{print $2,$3,$4,$5}'`;
      const result = await this.sshService.executeCommand(server, cmd);
      const [total, used, free, percent] = result.stdout.trim().split(/\s+/);

      return [{
        total: Math.round(parseInt(total) / (1024 * 1024)), // KB to GB
        used: Math.round(parseInt(used) / (1024 * 1024)),
        free: Math.round(parseInt(free) / (1024 * 1024)),
        usagePercent: parseInt(percent.replace('%', '')),
        mountPoint: '/',
      }];
    } catch (error) {
      this.logger.warn(`Error en disco: ${error.message}`);
      return [{ total: 0, used: 0, free: 0, usagePercent: 0, mountPoint: '/' }];
    }
  }
}
```

#### 2. Timeout por Comando Individual

```typescript
async executeCommandWithTimeout(
  server: Server,
  command: string,
  timeoutMs: number = 10000
): Promise<SSHExecResult> {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Comando timeout después de ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    try {
      const result = await this.sshService.executeCommand(server, command);
      clearTimeout(timeout);
      resolve(result);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
```

#### 3. Pool de Conexiones SSH

```typescript
// Reutilizar conexiones SSH en lugar de crear nuevas cada vez
export class SSHPoolService {
  private pools: Map<string, Client[]> = new Map();
  private readonly MAX_POOL_SIZE = 3;

  async getConnection(server: Server): Promise<Client> {
    const pool = this.pools.get(server.id) || [];

    // Buscar conexión disponible
    for (const conn of pool) {
      if (this.isConnectionReady(conn)) {
        return conn;
      }
    }

    // Crear nueva si el pool no está lleno
    if (pool.length < this.MAX_POOL_SIZE) {
      const newConn = await this.createConnection(server);
      pool.push(newConn);
      this.pools.set(server.id, pool);
      return newConn;
    }

    // Esperar a que una conexión esté disponible
    return await this.waitForAvailableConnection(server);
  }
}
```

---

## 📊 Comparación de Enfoques

| Característica | Agente Propio | Node Exporter | SSH Mejorado |
|----------------|---------------|---------------|--------------|
| **Confiabilidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Velocidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Facilidad** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Costo** | Bajo | Gratis | Gratis |
| **Mantenimiento** | Medio | Bajo | Alto |

---

## 🎯 Recomendación Final

### Para Producción (MEJOR):
**Enfoque 1 o 2**: Agente de monitoreo o Node Exporter
- Más confiable y escalable
- Mejor rendimiento
- Menos problemas a largo plazo

### Para Desarrollo/Testing:
**Enfoque 3**: SSH mejorado
- No requiere instalación adicional
- Funciona inmediatamente
- Suficiente para entornos pequeños

---

## 🚀 Plan de Migración Gradual

1. **Fase 1** (Hoy): Mejorar comandos SSH actuales
2. **Fase 2** (Esta semana): Instalar agente en 1-2 servidores de prueba
3. **Fase 3** (Próximo mes): Migrar todos los servidores al agente
4. **Fase 4** (Futuro): Considerar Prometheus para métricas avanzadas

---

## 💡 Ejemplo de Migración Híbrida

```typescript
@Injectable()
export class HybridMetricsService {
  async getMetrics(server: Server): Promise<ServerMetricsDto> {
    // Intentar primero con agente
    if (server.has_agent) {
      try {
        return await this.agentService.getMetrics(server);
      } catch (error) {
        this.logger.warn(`Agente falló, usando SSH como fallback`);
      }
    }

    // Fallback a SSH
    return await this.sshMetricsService.getMetrics(server);
  }
}
```

Esto permite migración gradual sin interrumpir el servicio existente.
