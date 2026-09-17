// src/monitoring/dto/agent-data-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class MetricPointDto {
  @ApiProperty()
  timestamp: Date;

  @ApiProperty({ example: 37.5 })
  value: number;
}

/**
 * DTO de respuesta para métricas en tiempo real
 */
export class RealtimeMetricsDto {
  @ApiProperty({ example: '3c89cbc3-4378-46f0-ab3a-deb9b4a8e4eb' })
  serverId: string;

  @ApiProperty({ example: 'DevStar' })
  serverName: string;

  @ApiProperty({ example: 37.5 })
  cpu: number;

  @ApiProperty({ example: 65.4 })
  memory: number;

  @ApiProperty({ example: 13.7 })
  disk: number;

  @ApiProperty({ example: 226338 })
  uptime: number;

  @ApiProperty()
  timestamp: Date;
}

/**
 * DTO de respuesta para métricas históricas
 */
export class HistoricalMetricsDto {
  @ApiProperty({ example: '3c89cbc3-4378-46f0-ab3a-deb9b4a8e4eb' })
  serverId: string;

  @ApiProperty({ type: [MetricPointDto] })
  cpu: MetricPointDto[];

  @ApiProperty({ type: [MetricPointDto] })
  memory: MetricPointDto[];

  @ApiProperty({ type: [MetricPointDto] })
  disk: MetricPointDto[];

  @ApiProperty({ type: [MetricPointDto], description: 'Carga media de 1 minuto' })
  loadAverage: MetricPointDto[];

  @ApiProperty({ type: [MetricPointDto], description: 'Conexiones de red activas' })
  connections: MetricPointDto[];

  @ApiProperty()
  startTime: Date;

  @ApiProperty()
  endTime: Date;
}

/** Agregado de todos los servidores del usuario, en una sola consulta. */
export class AccountOverviewDto {
  @ApiProperty({ description: 'Servidores registrados', example: 4 })
  servers: number;

  @ApiProperty({ description: 'Servidores que han reportado alguna métrica', example: 3 })
  reporting: number;

  @ApiProperty({ example: 160 })
  services: number;

  @ApiProperty({ example: 12 })
  websites: number;

  @ApiProperty({ example: 5 })
  databases: number;

  @ApiProperty({ example: 393 })
  processes: number;

  @ApiProperty({ description: 'CPU media entre los servidores que reportan', example: 41.2 })
  avgCpu: number;

  @ApiProperty({ example: 67.6 })
  avgMemory: number;

  @ApiProperty({
    nullable: true,
    description: 'Métrica más reciente de la cuenta; null si nunca ha reportado nadie',
  })
  lastReportAt: Date | null;
}

/**
 * DTO de respuesta para información del sistema
 */
export class SystemInfoResponseDto {
  @ApiProperty({ example: 'devstar' })
  hostname: string;

  @ApiProperty({ example: 'linux' })
  platform: string;

  @ApiProperty({ example: 'Ubuntu 24.04.3 LTS' })
  distro: string;

  @ApiProperty({ example: '6.8.0-87-generic' })
  kernel: string;

  @ApiProperty({ example: 'x86_64' })
  arch: string;

  @ApiProperty({ example: 226338 })
  uptime: number;

  @ApiProperty()
  bootTime: Date;

  @ApiProperty({ example: '191.109.99.119' })
  publicIP: string;

  @ApiProperty({ example: ['192.168.1.18', '172.19.0.1'] })
  privateIPs: string[];
}

/**
 * DTO de respuesta para servicios
 */
export class ServicesResponseDto {
  @ApiProperty()
  services: ServiceItemDto[];

  @ApiProperty({ example: 98 })
  totalActive: number;

  @ApiProperty({ example: 50 })
  totalInactive: number;

  @ApiProperty({ example: 2 })
  totalFailed: number;
}

export class ServiceItemDto {
  @ApiProperty({ example: 'nginx' })
  name: string;

  @ApiProperty({ example: 'NGINX web server' })
  displayName: string;

  @ApiProperty({
    example: 'active',
    enum: ['active', 'inactive', 'failed', 'unknown'],
  })
  state: string;

  @ApiProperty({ example: 'running' })
  subState: string;

  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiProperty({ example: 12345, nullable: true })
  pid: number | null;

  @ApiProperty({ example: 52428800 })
  memory: number;
}

/**
 * DTO de respuesta para procesos
 */
export class ProcessItemDto {
  @ApiProperty({ example: 1234 })
  pid: number;

  @ApiProperty({ example: 'node' })
  name: string;

  @ApiProperty({ example: 45.6 })
  cpu: number;

  @ApiProperty({ example: 5.2 })
  mem: number;

  @ApiProperty({ example: 524288000 })
  memVsz: number;

  @ApiProperty({ example: 262144000 })
  memRss: number;

  @ApiProperty({ example: 'root' })
  user: string;

  @ApiProperty({ example: 'node /app/server.js' })
  command: string;
}

export class ProcessesResponseDto {
  @ApiProperty({ type: [ProcessItemDto] })
  topByCPU: ProcessItemDto[];

  @ApiProperty({ type: [ProcessItemDto] })
  topByMemory: ProcessItemDto[];

  @ApiProperty({ example: 234 })
  total: number;
}

/**
 * DTO de resumen para dashboard (proyección mínima)
 */
export class ServerSummaryDto {
  @ApiProperty({ example: '3c89cbc3-4378-46f0-ab3a-deb9b4a8e4eb' })
  serverId: string;

  @ApiProperty()
  timestamp: Date;

  @ApiProperty({ example: 37.5, description: 'Uso de CPU (%)' })
  cpu: number;

  @ApiProperty({ example: 65.4, description: 'Uso de memoria (%)' })
  memory: number;

  @ApiProperty({ example: 42.1, description: 'Uso del disco raíz (%)' })
  disk: number;

  @ApiProperty({ example: 12, description: 'Conexiones de red activas' })
  connections: number;
}

/**
 * DTO para el estado de conexión del agente
 */
export class AgentConnectionStatusDto {
  @ApiProperty({ example: true })
  connected: boolean;

  @ApiProperty({ nullable: true })
  lastSeen: Date | null;

  @ApiProperty({ example: '1.0.0', nullable: true })
  agentVersion: string | null;
}

/**
 * Estado en vivo de un servidor para la lista.
 *
 * Los numéricos son `null` cuando **todavía no hay dato**: un servidor recién
 * dado de alta, o un inventario que aún no ha llegado. Cero significa cero
 * medido, y la interfaz distingue los dos casos.
 */
export class ServerLiveSummaryDto {
  @ApiProperty()
  serverId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'online', description: 'Estado persistido en tbl_servers' })
  status: string;

  @ApiProperty({ example: true, description: 'El agente tiene socket abierto ahora mismo' })
  agentConnected: boolean;

  @ApiProperty({ nullable: true })
  lastSeen: Date | null;

  @ApiProperty({ example: true, description: 'false = el agente nunca ha reportado' })
  hasMetrics: boolean;

  @ApiProperty({ nullable: true })
  lastMetricAt: Date | null;

  @ApiProperty({ example: 37.5, nullable: true })
  cpu: number | null;

  @ApiProperty({ example: 65.4, nullable: true })
  memory: number | null;

  @ApiProperty({ example: 42.1, nullable: true, description: 'Uso del montaje raíz (%)' })
  disk: number | null;

  @ApiProperty({ example: 226338, nullable: true, description: 'Segundos' })
  uptime: number | null;

  @ApiProperty({ example: 38, nullable: true, description: 'Servicios activos' })
  services: number | null;

  @ApiProperty({ example: 104, nullable: true, description: 'Unidades systemd cargadas' })
  servicesTotal: number | null;

  @ApiProperty({ example: 2, nullable: true })
  servicesFailed: number | null;

  @ApiProperty({ example: 3, nullable: true })
  websites: number | null;

  @ApiProperty({ example: 1, nullable: true })
  databases: number | null;

  @ApiProperty({ example: 177, nullable: true })
  processes: number | null;

  @ApiProperty({ example: '2.1.0-go', nullable: true })
  agentVersion: string | null;
}

export class ServersSummaryDto {
  @ApiProperty({ type: [ServerLiveSummaryDto] })
  servers: ServerLiveSummaryDto[];

  @ApiProperty({ example: 4 })
  total: number;

  @ApiProperty({ example: 3, description: 'Servidores con el agente conectado' })
  online: number;

  @ApiProperty()
  generatedAt: Date;
}
