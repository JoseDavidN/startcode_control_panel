import { ApiProperty } from '@nestjs/swagger';

export class CpuMetricsDto {
  @ApiProperty({ description: 'Uso de CPU en porcentaje', example: 42.1 })
  usage: number;

  @ApiProperty({ description: 'Número de núcleos de CPU', example: 4 })
  cores: number;

  @ApiProperty({ example: '0.50, 0.45, 0.40', description: 'Load average' })
  loadAverage: string;
}

export class MemoryMetricsDto {
  @ApiProperty({ example: 8192, description: 'Memoria total en MB' })
  total: number;

  @ApiProperty({ example: 5120, description: 'Memoria usada en MB' })
  used: number;

  @ApiProperty({ example: 3072, description: 'Memoria libre en MB' })
  free: number;

  @ApiProperty({ example: 62.5, description: 'Porcentaje de uso' })
  usagePercent: number;
}

export class DiskMetricsDto {
  @ApiProperty({ example: 100, description: 'Espacio total en GB' })
  total: number;

  @ApiProperty({ example: 65, description: 'Espacio usado en GB' })
  used: number;

  @ApiProperty({ example: 35, description: 'Espacio libre en GB' })
  free: number;

  @ApiProperty({ example: 65, description: 'Porcentaje de uso' })
  usagePercent: number;

  @ApiProperty({ example: '/', description: 'Punto de montaje' })
  mountPoint: string;
}

export class NetworkMetricsDto {
  @ApiProperty({ example: '192.168.1.100', description: 'IP privada' })
  privateIp: string;

  @ApiProperty({ example: '203.0.113.1', description: 'IP pública' })
  publicIp: string;

  @ApiProperty({ example: 'eth0', description: 'Interfaz de red' })
  interface: string;
}

export class SystemInfoDto {
  @ApiProperty({
    example: 'Ubuntu 22.04.3 LTS',
    description: 'Sistema operativo',
  })
  os: string;

  @ApiProperty({
    example: '5.15.0-91-generic',
    description: 'Versión del kernel',
  })
  kernel: string;

  @ApiProperty({ example: 'server-web-01', description: 'Hostname' })
  hostname: string;

  @ApiProperty({ example: '15 days, 3:24', description: 'Tiempo de actividad' })
  uptime: string;

  @ApiProperty({ example: 1703001234, description: 'Uptime en segundos' })
  uptimeSeconds: number;
}

export class ProcessInfoDto {
  @ApiProperty({ example: 145, description: 'Procesos en ejecución' })
  running: number;

  @ApiProperty({ example: 12, description: 'Procesos zombies' })
  zombie: number;

  @ApiProperty({ example: 157, description: 'Total de procesos' })
  total: number;
}

export class ServerMetricsDto {
  @ApiProperty({ description: 'ID del servidor' })
  serverId: string;

  @ApiProperty({ description: 'Nombre del servidor' })
  serverName: string;

  @ApiProperty({ type: CpuMetricsDto })
  cpu: CpuMetricsDto;

  @ApiProperty({ type: MemoryMetricsDto })
  memory: MemoryMetricsDto;

  @ApiProperty({ type: [DiskMetricsDto] })
  disk: DiskMetricsDto[];

  @ApiProperty({ type: NetworkMetricsDto })
  network: NetworkMetricsDto;

  @ApiProperty({ type: SystemInfoDto })
  system: SystemInfoDto;

  @ApiProperty({ type: ProcessInfoDto })
  processes: ProcessInfoDto;

  @ApiProperty({ example: '2024-01-01T12:00:00Z' })
  timestamp: Date;

  @ApiProperty({ example: 'online' })
  status: string;
}

export class QuickStatsDto {
  @ApiProperty({ example: 45.2 })
  cpuUsage: number;

  @ApiProperty({ example: 62.5 })
  memoryUsage: number;

  @ApiProperty({ example: 65.0 })
  diskUsage: number;

  @ApiProperty({ example: 25 })
  activeServices: number;

  @ApiProperty({ example: '15 days, 3 hours, 24 minutes' })
  uptime: string;

  @ApiProperty({ example: 1703001234 })
  uptimeSeconds: number;

  @ApiProperty({ example: '192.168.1.100' })
  network: string;

  @ApiProperty({ example: 'online' })
  status: string;
}