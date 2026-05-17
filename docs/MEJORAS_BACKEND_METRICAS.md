# Mejoras Recomendadas para el Backend - Monitoreo de Servidores

## Problemas Identificados

### 1. **Timeout de Conexión SSH muy corto (15 segundos)**
**Ubicación:** `BACKEND/src/monitoring/services/ssh.service.ts:54-57`

**Problema:**
- Si el servidor está bajo carga o la red es lenta, 15 segundos puede no ser suficiente
- Esto causa que algunas peticiones fallen intermitentemente

**Solución Recomendada:**
```typescript
// Aumentar timeout a 30 segundos
const timeout = setTimeout(() => {
  conn.end();
  reject(new Error('Timeout de conexión SSH (30 segundos)'));
}, 30000); // Cambiar de 15000 a 30000
```

---

### 2. **Promise.all sin manejo granular de errores**
**Ubicación:** `BACKEND/src/monitoring/services/metrics.service.ts:32-39`

**Problema:**
- Si UNA métrica falla, TODO el proceso falla
- No hay fallback para métricas individuales

**Solución Recomendada:**
```typescript
async getFullMetrics(server: Server): Promise<ServerMetricsDto> {
  try {
    await this.sshService.disconnect(server.id);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Usar Promise.allSettled en lugar de Promise.all
    const results = await Promise.allSettled([
      this.getCpuMetrics(server),
      this.getMemoryMetrics(server),
      this.getDiskMetrics(server),
      this.getNetworkMetrics(server),
      this.getSystemInfo(server),
      this.getProcessInfo(server),
    ]);

    // Extraer valores o proporcionar valores por defecto
    const cpu = results[0].status === 'fulfilled'
      ? results[0].value
      : { usage: 0, cores: 1, loadAverage: '0, 0, 0' };

    const memory = results[1].status === 'fulfilled'
      ? results[1].value
      : { total: 0, used: 0, free: 0, usagePercent: 0 };

    const disk = results[2].status === 'fulfilled' && Array.isArray(results[2].value) && results[2].value.length > 0
      ? results[2].value
      : [{ total: 0, used: 0, free: 0, usagePercent: 0, mountPoint: '/' }];

    const network = results[3].status === 'fulfilled'
      ? results[3].value
      : { privateIp: 'N/A', publicIp: 'N/A', interface: 'N/A' };

    const system = results[4].status === 'fulfilled'
      ? results[4].value
      : { os: 'N/A', kernel: 'N/A', hostname: 'N/A', uptime: 'N/A', uptimeSeconds: 0 };

    const processes = results[5].status === 'fulfilled'
      ? results[5].value
      : { total: 0, running: 0, zombie: 0 };

    // Log de métricas que fallaron
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const metricNames = ['CPU', 'Memory', 'Disk', 'Network', 'System', 'Processes'];
        this.logger.warn(`Falló métrica de ${metricNames[index]}: ${result.reason?.message}`);
      }
    });

    await this.sshService.disconnect(server.id);

    return {
      serverId: server.id,
      serverName: server.str_name,
      cpu,
      memory,
      disk,
      network,
      system,
      processes,
      timestamp: new Date(),
      status: 'online',
    };
  } catch (error) {
    await this.sshService.disconnect(server.id);
    this.logger.error(
      `Error obteniendo métricas de ${server.str_name}: ${error.message}`,
    );
    throw error;
  }
}
```

---

### 3. **Parsing sin validación robusta**
**Ubicación:** Múltiples métodos en `metrics.service.ts`

**Problema:**
- Si un comando retorna formato inesperado, el parsing falla sin fallback
- No hay validación de que los datos parseados sean números válidos

**Solución Recomendada:**

```typescript
async getCpuMetrics(server: Server): Promise<CpuMetricsDto> {
  try {
    const command = [
      "top -bn1 | grep 'Cpu(s)' | awk '{print 100 - $8}'",
      'nproc',
      "uptime | awk -F'load average:' '{print $2}' | xargs",
    ];

    const results = await this.sshService.executeCommands(server, command);

    // Parsing con validación
    const usageStr = results[0].stdout.trim();
    const usage = !isNaN(parseFloat(usageStr)) ? parseFloat(usageStr) : 0;

    const coresStr = results[1].stdout.trim();
    const cores = !isNaN(parseInt(coresStr)) ? parseInt(coresStr) : 1;

    const loadAverage = results[2].stdout.trim() || '0, 0, 0';

    return {
      usage: Math.min(100, Math.max(0, Math.round(usage * 100) / 100)), // Clamp entre 0-100
      cores: Math.max(1, cores), // Mínimo 1 core
      loadAverage,
    };
  } catch (error) {
    this.logger.warn(`Error obteniendo CPU metrics: ${error.message}`);
    // Retornar valores por defecto en lugar de lanzar error
    return {
      usage: 0,
      cores: 1,
      loadAverage: '0, 0, 0',
    };
  }
}
```

---

### 4. **Agregar Sistema de Cache**

**Problema:**
- Cada petición ejecuta comandos SSH, sobrecargando el servidor
- No hay cache de métricas recientes

**Solución Recomendada:**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';

@Injectable()
export class MetricsService {
  constructor(
    private sshService: SSHService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getFullMetrics(server: Server): Promise<ServerMetricsDto> {
    const cacheKey = `metrics:${server.id}`;

    // Intentar obtener del cache (válido por 10 segundos)
    const cached = await this.cacheManager.get<ServerMetricsDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Usando métricas en cache para ${server.str_name}`);
      return cached;
    }

    // Si no hay cache, obtener métricas frescas
    const metrics = await this.fetchFreshMetrics(server);

    // Guardar en cache por 10 segundos
    await this.cacheManager.set(cacheKey, metrics, 10000);

    return metrics;
  }

  private async fetchFreshMetrics(server: Server): Promise<ServerMetricsDto> {
    // Lógica existente de getFullMetrics...
  }
}
```

---

### 5. **Agregar Reintentos Automáticos**

**Ubicación:** `BACKEND/src/monitoring/services/ssh.service.ts`

**Problema:**
- Si una conexión SSH falla temporalmente, no reintenta

**Solución Recomendada:**
```typescript
async connect(server: Server, forceNew: boolean = false, retries: number = 3): Promise<Client> {
  let lastError: Error;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await this.connectAttempt(server, forceNew);
    } catch (error) {
      lastError = error;
      this.logger.warn(
        `Intento ${attempt}/${retries} fallido para ${server.str_name}: ${error.message}`
      );

      if (attempt < retries) {
        // Esperar antes de reintentar (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

private async connectAttempt(server: Server, forceNew: boolean = false): Promise<Client> {
  // Lógica de conexión actual...
}
```

---

### 6. **Mejorar Logs para Debugging**

**Problema:**
- Logs insuficientes para diagnosticar por qué fallan las peticiones

**Solución Recomendada:**
```typescript
async getFullMetrics(server: Server): Promise<ServerMetricsDto> {
  const startTime = Date.now();
  this.logger.debug(`[${server.str_name}] Iniciando obtención de métricas...`);

  try {
    await this.sshService.disconnect(server.id);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const results = await Promise.allSettled([...]);

    results.forEach((result, index) => {
      const metricNames = ['CPU', 'Memory', 'Disk', 'Network', 'System', 'Processes'];
      if (result.status === 'fulfilled') {
        this.logger.debug(`[${server.str_name}] ✅ ${metricNames[index]} obtenido`);
      } else {
        this.logger.error(`[${server.str_name}] ❌ ${metricNames[index]} falló: ${result.reason?.message}`);
      }
    });

    const duration = Date.now() - startTime;
    this.logger.log(`[${server.str_name}] Métricas obtenidas en ${duration}ms`);

    return { /* ... */ };
  } catch (error) {
    const duration = Date.now() - startTime;
    this.logger.error(`[${server.str_name}] Error después de ${duration}ms: ${error.message}`);
    throw error;
  }
}
```

---

## Resumen de Implementación

### Prioridad Alta (Implementar Ya):
1. ✅ Aumentar timeout SSH a 30 segundos
2. ✅ Usar Promise.allSettled con valores por defecto
3. ✅ Agregar validación en parsing de métricas

### Prioridad Media (Implementar Pronto):
4. Agregar sistema de cache (10 segundos)
5. Mejorar logs para debugging

### Prioridad Baja (Opcional):
6. Agregar reintentos automáticos en conexiones SSH

---

## Testing Recomendado

Después de implementar las mejoras, probar:

```bash
# 1. Servidor lento (simular latencia alta)
# 2. Servidor con carga alta
# 3. Múltiples peticiones concurrentes
# 4. Servidor con comandos que fallen
# 5. Desconexión de red durante petición
```

---

## Monitoreo

Agregar métricas para monitorear:
- Tasa de éxito/fallo de conexiones SSH
- Tiempo promedio de respuesta por servidor
- Tasa de uso de cache
- Métricas individuales que más fallan
