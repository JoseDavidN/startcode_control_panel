import { useQuery } from '@tanstack/react-query';
import { apiService } from '@services/api.service';
import { useServerMetrics } from '@contexts/RealtimeMetricsContext';

/**
 * Interfaz para las métricas de CPU detalladas
 */
export interface CpuMetrics {
  usage: number;        // Uso de CPU en porcentaje
  cores: number;        // Número de núcleos
  loadAverage: string;  // Promedio de carga del sistema
}

/**
 * Interfaz para las métricas de memoria detalladas
 */
export interface MemoryMetrics {
  total: number;        // Memoria total en MB
  used: number;         // Memoria usada en MB
  free: number;         // Memoria libre en MB
  usagePercent: number; // Porcentaje de uso
}

/**
 * Interfaz para las métricas de disco detalladas
 */
export interface DiskMetrics {
  total: number;        // Espacio total en GB
  used: number;         // Espacio usado en GB
  free: number;         // Espacio libre en GB
  usagePercent: number; // Porcentaje de uso
  mountPoint: string;   // Punto de montaje (ej: "/", "/home")
}

/**
 * Interfaz para información de red
 */
export interface NetworkMetrics {
  privateIp: string;    // IP privada del servidor
  publicIp: string;     // IP pública del servidor
  interface: string;    // Interfaz de red (ej: "eth0")
}

/**
 * Interfaz para información del sistema operativo
 */
export interface SystemInfo {
  os: string;           // Sistema operativo (ej: "Ubuntu 22.04.3 LTS")
  kernel: string;       // Versión del kernel
  hostname: string;     // Nombre del host
  uptime: string;       // Tiempo de actividad en formato legible
  uptimeSeconds: number; // Tiempo de actividad en segundos
}

/**
 * Interfaz para información de procesos
 */
export interface ProcessInfo {
  running: number;      // Procesos en ejecución
  sleeping: number;     // Procesos durmiendo
  stopped: number;      // Procesos detenidos
  zombie: number;       // Procesos zombie
  total: number;        // Total de procesos
  topList?: any[];      // Lista de procesos principales
}

/**
 * Interfaz para información de servicios
 */
/** Servicio systemd tal y como lo envía el agente. */
export interface SystemdServiceInfo {
  name: string;
  displayName: string;
  state: 'active' | 'inactive' | 'failed' | 'unknown';
  subState: string;
  enabled: boolean;
  pid: number | null;
  /** Bytes; systemd no reporta CPU por unidad, llega siempre en 0 */
  memory: number;
  cpuPercent: number;
}

export interface ServicesInfo {
  count: number;
  list: SystemdServiceInfo[];
}

export interface WebsiteInfo {
  domain: string;
  port?: number;
  ssl?: boolean;
  certExpiry?: string | null;
  path?: string;
  server?: string;
}

export interface DatabaseInfo {
  type: string;
  version?: string;
  running?: boolean;
  size?: string | number;
  databases?: string[];
}

/**
 * Interfaz completa para todas las métricas detalladas del servidor
 */
export interface ServerDetailMetrics {
  serverId: string;          // ID del servidor
  serverName: string;        // Nombre del servidor
  cpu: CpuMetrics;          // Métricas de CPU
  memory: MemoryMetrics;    // Métricas de memoria
  disk: DiskMetrics[];      // Métricas de disco (array para múltiples particiones)
  network: NetworkMetrics;  // Información de red
  system: SystemInfo;       // Información del sistema
  processes: ProcessInfo;   // Información de procesos
  services: ServicesInfo;   // Información de servicios
  websites: { count: number; list: WebsiteInfo[] };
  databases: { count: number; list: DatabaseInfo[] };
  timestamp: string;        // Timestamp de la última actualización
  status: string;           // Estado del servidor (online, offline, etc.)
}

/**
 * Hook para obtener métricas detalladas de un servidor específico
 * Hace polling automático para mantener los datos actualizados
 * Incluye manejo robusto de errores y reintentos automáticos
 *
 * @param serverId - ID del servidor a monitorear
 * @param refetchIntervalMs - Intervalo de actualización en milisegundos (por defecto 30 segundos)
 * @returns Query con las métricas detalladas del servidor
 *
 * @example
 * ```tsx
 * const { data: metrics, isLoading, error } = useServerDetail('server-123');
 *
 * if (isLoading) return <div>Cargando...</div>;
 * if (error) return <div>Error al cargar métricas</div>;
 *
 * return (
 *   <div>
 *     <p>CPU: {metrics.cpu.usage}%</p>
 *     <p>Memoria: {metrics.memory.usagePercent}%</p>
 *   </div>
 * );
 * ```
 */
export function useServerDetail(
  serverId: string,
  refetchIntervalMs: number = 30000
) {
  // Cuando el WebSocket está activo para este servidor, el polling periódico
  // es tráfico duplicado: el canal WS ya entrega cpu/memory/disk en tiempo real.
  // La carga inicial siempre se realiza (enabled: true) porque serverData contiene
  // datos estructurales que el WS no envía (OS, kernel, IPs, filesystems detallados).
  const { connected: wsConnected } = useServerMetrics(serverId);

  return useQuery<ServerDetailMetrics>({
    queryKey: ['serverDetail', serverId],
    enabled: !!serverId,
    refetchInterval: wsConnected ? false : refetchIntervalMs,
    refetchIntervalInBackground: !wsConnected,
    staleTime: 15000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

    // Función que obtiene los datos del backend
    queryFn: async () => {
      try {
        // Llamada al endpoint de métricas del agente (nuevo sistema sin SSH)
        const response = await apiService.get<ServerDetailMetrics>(
          `/agent-data/servers/${serverId}/latest`,
          {
            // Timeout de 10 segundos
            timeout: 10000,
          }
        );

        // Manejar respuesta del backend
        const payload: any = response && response.data ? response.data : response;
        const rawData: any = payload && payload.data ? payload.data : payload;

        // Validar que tenemos datos válidos
        if (!rawData || typeof rawData !== 'object') {
          throw new Error('Respuesta inválida del servidor');
        }

        // Función auxiliar para formatear uptime en segundos a texto
        const formatUptime = (seconds: number): string => {
          const days = Math.floor(seconds / 86400);
          const hours = Math.floor((seconds % 86400) / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          return `${days} days, ${hours} hours, ${minutes} minutes`;
        };

        /* Los inventarios sí tienen forma conocida: se acotan una vez aquí en
           lugar de hacer accesos sueltos sobre el `any` del payload. */
        const inventory = rawData as {
          services?: { count?: number; list?: SystemdServiceInfo[] };
          websites?: { count?: number; list?: WebsiteInfo[] };
          databases?: { count?: number; list?: DatabaseInfo[] };
        };

        // Transformar la estructura del agente a la estructura esperada
        const transformedData: ServerDetailMetrics = {
          serverId: rawData.serverId || serverId,
          serverName: rawData.serverName || 'Servidor',
          status: 'online',
          timestamp: rawData.timestamp || new Date().toISOString(),

          cpu: {
            usage: Number(rawData.cpu?.usage) || 0,
            cores: rawData.cpu?.usagePerCore?.length || 1,
            loadAverage: rawData.cpu?.loadAverage
              ? `${rawData.cpu.loadAverage.current.toFixed(2)} / ${rawData.cpu.loadAverage.avg5.toFixed(2)} / ${rawData.cpu.loadAverage.avg15.toFixed(2)}`
              : '0.00 / 0.00 / 0.00',
          },

          memory: {
            // Los valores de memoria vienen en bytes desde el agente
            // Convertir bytes a MB: dividir entre (1024 * 1024)
            total: (Number(rawData.memory?.total) || 0) / (1024 * 1024),
            used: (Number(rawData.memory?.used) || 0) / (1024 * 1024),
            free: (Number(rawData.memory?.free) || 0) / (1024 * 1024),
            usagePercent: Number(rawData.memory?.usagePercent) || 0,
          },

          disk: Array.isArray(rawData.disk?.filesystems) && rawData.disk.filesystems.length > 0
            ? rawData.disk.filesystems.map((fs: any) => {
                // Los valores vienen en bytes desde el agente (size, used, available)
                // Convertir bytes a GB: dividir entre (1024 * 1024 * 1024)
                const bytesToGB = (bytes: number) => bytes / (1024 * 1024 * 1024);

                const sizeInBytes = Number(fs.size) || 0;
                const usedInBytes = Number(fs.used) || 0;
                const availableInBytes = Number(fs.available) || 0;

                return {
                  total: bytesToGB(sizeInBytes),
                  used: bytesToGB(usedInBytes),
                  free: bytesToGB(availableInBytes),
                  usagePercent: Number(fs.usagePercent) || 0,
                  mountPoint: fs.mount || '/',
                };
              })
            : [{
                total: 0,
                used: 0,
                free: 0,
                usagePercent: 0,
                mountPoint: '/'
              }],

          network: {
            publicIp: rawData.network?.publicIP || 'N/A',
            privateIp: Array.isArray(rawData.network?.privateIPs) && rawData.network.privateIPs.length > 0
              ? rawData.network.privateIPs[0]
              : 'N/A',
            interface: 'eth0',
          },

          system: {
            os: rawData.system?.distro || rawData.system?.platform || 'Linux',
            kernel: rawData.system?.kernel || 'N/A',
            hostname: rawData.system?.hostname || 'N/A',
            uptime: formatUptime(Number(rawData.system?.uptime) || 0),
            uptimeSeconds: Number(rawData.system?.uptime) || 0,
          },

          processes: {
            running: rawData.processes?.running || 0,
            sleeping: rawData.processes?.sleeping || 0,
            stopped: rawData.processes?.stopped || 0,
            zombie: rawData.processes?.zombie || 0,
            total: rawData.processes?.total || 0,
          },

          services: {
            count: Number(inventory.services?.count) || 0,
            list: Array.isArray(inventory.services?.list) ? inventory.services.list : [],
          },

          websites: {
            count: Number(inventory.websites?.count) || 0,
            list: Array.isArray(inventory.websites?.list) ? inventory.websites.list : [],
          },

          databases: {
            count: Number(inventory.databases?.count) || 0,
            list: Array.isArray(inventory.databases?.list) ? inventory.databases.list : [],
          },
        };

        return transformedData;
      } catch (error: any) {
        // Log detallado del error para debugging
        console.error('Error al obtener métricas detalladas del servidor:', {
          serverId,
          error: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });

        // Re-lanzar el error para que React Query lo maneje
        throw error;
      }
    },
  });
}
