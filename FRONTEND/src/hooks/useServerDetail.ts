import { useQuery } from '@tanstack/react-query';
import { apiService } from '@services/api.service';
import { useServerMetrics } from '@hooks/useRealtimeMetrics';
import { formatUptime } from '@utils/time';

/**
 * Interfaz para las métricas de CPU detalladas
 */
export interface CpuMetrics {
  usage: number;          // Uso de CPU en porcentaje
  cores: number;          // Núcleos lógicos
  physicalCores: number;  // Núcleos físicos (0 si el agente no lo reporta)
  brand: string;          // Modelo: "AMD Ryzen 7 5800X"
  manufacturer: string;   // "AuthenticAMD"
  loadAverage: string;    // Promedio de carga del sistema
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
  device: string;       // Dispositivo (ej: "/dev/nvme0n1p2"); '' si el agente no lo manda
}

/**
 * Interfaz para información de red
 */
/** Interfaz de red tal y como la reporta el agente. */
export interface NetworkInterfaceInfo {
  iface: string;
  ip4: string;
  ip6: string;
  mac: string;
  operstate: string;    // "up" | "down" | lo que diga el kernel
  rxBytes: number;
  txBytes: number;
}

export interface NetworkMetrics {
  privateIp: string;    // IP privada del servidor
  publicIp: string;     // IP pública del servidor
  /** Interfaz principal; null si el agente no reporta interfaces */
  primary: NetworkInterfaceInfo | null;
  interfaces: NetworkInterfaceInfo[];
}

/**
 * Interfaz para información del sistema operativo
 */
export interface SystemInfo {
  os: string;           // Sistema operativo (ej: "Ubuntu 22.04.3 LTS")
  kernel: string;       // Versión del kernel
  hostname: string;     // Nombre del host
  arch: string;         // Arquitectura (ej: "x86_64")
  uptime: string;       // Tiempo de actividad en formato legible
  uptimeSeconds: number; // Tiempo de actividad en segundos
}

/**
 * Interfaz para información de procesos
 */
/** Proceso del top que publica el agente (unión del top por CPU y por memoria). */
export interface TopProcess {
  pid: number;
  name: string;
  cpu: number;          // % de CPU
  mem: number;          // % de memoria
  memRss: number;       // Memoria residente en bytes
  user: string;
  command: string;      // Línea de comandos: el nombre puede ser genérico ("MainThread")
}

export interface ProcessInfo {
  running: number;      // Procesos en ejecución
  sleeping: number;     // Procesos durmiendo
  stopped: number;      // Procesos detenidos
  zombie: number;       // Procesos zombie
  total: number;        // Total de procesos
  topList: TopProcess[]; // Procesos principales
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
  /** Bytes. systemd no reporta CPU por unidad, así que ese dato no existe */
  memory: number;
}

export interface ServicesInfo {
  count: number;
  active: number;
  failed: number;
  list: SystemdServiceInfo[];
  /** Unidades que el usuario fijó para este servidor. */
  pinned: string[];
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
  /** Bytes del directorio de datos. Ausente = no se pudo medir (cero sería mentira) */
  sizeBytes?: number;
  /** Ausente = el agente no tuvo acceso; `[]` = acceso y ninguna base */
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

/* Muestra cruda del agente tal y como la guarda el backend. Todo es opcional:
   el contrato no se valida en el servidor, así que aquí se normaliza. */
type NumLike = number | string;

interface RawAgentInterface {
  iface?: string;
  ip4?: string;
  ip6?: string;
  mac?: string;
  operstate?: string;
  rx_bytes?: NumLike;
  tx_bytes?: NumLike;
}

interface RawAgentFilesystem {
  fs?: unknown;
  mount?: string;
  size?: NumLike;
  used?: NumLike;
  available?: NumLike;
  usagePercent?: NumLike;
}

interface RawAgentMetrics {
  serverId?: string;
  serverName?: string;
  timestamp?: string;
  cpu?: {
    usage?: NumLike;
    cores?: NumLike;
    physicalCores?: NumLike;
    brand?: string;
    manufacturer?: string;
    usagePerCore?: number[];
    loadAverage?: { current: number; avg5: number; avg15: number };
  };
  memory?: { total?: NumLike; used?: NumLike; free?: NumLike; usagePercent?: NumLike };
  disk?: { filesystems?: RawAgentFilesystem[] };
  network?: {
    interfaces?: (RawAgentInterface | null)[];
    publicIP?: string;
    privateIPs?: string[];
  };
  system?: {
    distro?: string;
    platform?: string;
    kernel?: string;
    hostname?: string;
    arch?: string;
    uptime?: NumLike;
  };
  processes?: {
    running?: number;
    sleeping?: number;
    stopped?: number;
    zombie?: number;
    total?: number;
    topList?: Partial<TopProcess>[];
  };
  /* Los inventarios sí tienen forma conocida. */
  services?: {
    count?: number;
    active?: number;
    failed?: number;
    list?: SystemdServiceInfo[];
    pinned?: string[];
  };
  websites?: { count?: number; list?: WebsiteInfo[] };
  databases?: { count?: number; list?: DatabaseInfo[] };
}

/** Desenvuelve un nivel `{ data }` si lo hay (comprobación por veracidad). */
function unwrapData(value: unknown): unknown {
  const inner = (value as { data?: unknown } | null | undefined)?.data;
  return value && inner ? inner : value;
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
        const response = await apiService.get<unknown>(
          `/agent-data/servers/${serverId}/latest`,
          {
            // Timeout de 10 segundos
            timeout: 10000,
          }
        );

        // Manejar respuesta del backend
        const payload = unwrapData(response);
        const unwrapped = unwrapData(payload);

        // Validar que tenemos datos válidos
        if (!unwrapped || typeof unwrapped !== 'object') {
          throw new Error('Respuesta inválida del servidor');
        }

        const rawData = unwrapped as RawAgentMetrics;
        const inventory = rawData;

        /* Interfaces de red: el agente las manda en snake_case, que es el único
           punto donde el contrato cruza la frontera de estilo del frontend. */
        const interfaces: NetworkInterfaceInfo[] = Array.isArray(rawData.network?.interfaces)
          ? rawData.network.interfaces.map((i) => ({
              iface: i?.iface ?? '',
              ip4: i?.ip4 ?? '',
              ip6: i?.ip6 ?? '',
              mac: i?.mac ?? '',
              operstate: i?.operstate ?? '',
              rxBytes: Number(i?.rx_bytes) || 0,
              txBytes: Number(i?.tx_bytes) || 0,
            }))
          : [];

        /* La principal es la primera activa con IPv4; si ninguna lo está, la
           primera con IPv4; y si tampoco, la primera que haya. */
        const primaryInterface =
          interfaces.find(i => i.operstate === 'up' && i.ip4) ??
          interfaces.find(i => i.ip4) ??
          interfaces[0] ??
          null;

        // Transformar la estructura del agente a la estructura esperada
        const transformedData: ServerDetailMetrics = {
          serverId: rawData.serverId || serverId,
          serverName: rawData.serverName || 'Servidor',
          status: 'online',
          timestamp: rawData.timestamp || new Date().toISOString(),

          cpu: {
            usage: Number(rawData.cpu?.usage) || 0,
            cores: Number(rawData.cpu?.cores) || rawData.cpu?.usagePerCore?.length || 1,
            physicalCores: Number(rawData.cpu?.physicalCores) || 0,
            brand: rawData.cpu?.brand || '',
            manufacturer: rawData.cpu?.manufacturer || '',
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
            ? rawData.disk.filesystems.map((fs) => {
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
                  device: typeof fs.fs === 'string' ? fs.fs : '',
                };
              })
            : [{
                total: 0,
                used: 0,
                free: 0,
                usagePercent: 0,
                mountPoint: '/',
                device: '',
              }],

          network: {
            publicIp: rawData.network?.publicIP || 'N/A',
            /* La IP privada sale de la interfaz principal cuando la hay: es la
               misma que muestra la fila de interfaz, y así no se contradicen. */
            privateIp:
              primaryInterface?.ip4 ||
              (Array.isArray(rawData.network?.privateIPs) && rawData.network.privateIPs.length > 0
                ? rawData.network.privateIPs[0]
                : 'N/A'),
            primary: primaryInterface,
            interfaces,
          },

          system: {
            os: rawData.system?.distro || rawData.system?.platform || 'Linux',
            kernel: rawData.system?.kernel || 'N/A',
            hostname: rawData.system?.hostname || 'N/A',
            arch: rawData.system?.arch || '',
            uptime: formatUptime(Number(rawData.system?.uptime) || 0),
            uptimeSeconds: Number(rawData.system?.uptime) || 0,
          },

          processes: {
            running: rawData.processes?.running || 0,
            sleeping: rawData.processes?.sleeping || 0,
            stopped: rawData.processes?.stopped || 0,
            zombie: rawData.processes?.zombie || 0,
            total: rawData.processes?.total || 0,
            topList: Array.isArray(rawData.processes?.topList)
              ? rawData.processes.topList.map(p => ({
                  pid: Number(p.pid) || 0,
                  name: String(p.name ?? ''),
                  cpu: Number(p.cpu) || 0,
                  mem: Number(p.mem) || 0,
                  memRss: Number(p.memRss) || 0,
                  user: String(p.user ?? ''),
                  command: String(p.command ?? ''),
                }))
              : [],
          },

          services: {
            count: Number(inventory.services?.count) || 0,
            active: Number(inventory.services?.active) || 0,
            failed: Number(inventory.services?.failed) || 0,
            list: Array.isArray(inventory.services?.list) ? inventory.services.list : [],
            pinned: Array.isArray(inventory.services?.pinned) ? inventory.services.pinned : [],
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
      } catch (error) {
        // Log detallado del error para debugging
        const err = error as { message?: string; response?: { data?: unknown; status?: number } };
        console.error('Error al obtener métricas detalladas del servidor:', {
          serverId,
          error: err.message,
          response: err.response?.data,
          status: err.response?.status,
        });

        // Re-lanzar el error para que React Query lo maneje
        throw error;
      }
    },
  });
}
