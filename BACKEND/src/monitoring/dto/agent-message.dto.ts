// src/monitoring/dto/agent-message.dto.ts
import {
  IsString,
  IsNumber,
  IsObject,
  IsEnum,
  IsNotEmpty,
  ValidateNested,
  IsArray,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Tipos de mensajes que el agente puede enviar
 */
export enum AgentMessageType {
  HEARTBEAT = 'heartbeat',
  SYSTEM_INFO = 'system_info',
  METRICS = 'metrics',
  SERVICES_INVENTORY = 'services_inventory',
  PROCESSES_INVENTORY = 'processes_inventory',
  WEBSITES_INVENTORY = 'websites_inventory',
  DATABASES_INVENTORY = 'databases_inventory',
}

/**
 * DTO base para todos los mensajes del agente
 */
export class AgentMessageDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  agentVersion: string;

  @IsNumber()
  timestamp: number;

  @IsString()
  @IsNotEmpty()
  serverId: string;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsEnum(AgentMessageType)
  type: AgentMessageType;

  @IsObject()
  data: any; // Se valida según el tipo de mensaje
}

/**
 * DTOs para datos de métricas
 */
export class LoadAverageDto {
  @IsNumber()
  current: number;

  @IsNumber()
  avg5: number;

  @IsNumber()
  avg15: number;
}

export class ProcessInfoDto {
  @IsNumber()
  pid: number;

  @IsString()
  name: string;

  @IsNumber()
  cpu: number;

  @IsNumber()
  mem: number;

  @IsNumber()
  memVsz: number;

  @IsNumber()
  memRss: number;

  @IsString()
  user: string;

  @IsString()
  command: string;
}

export class CPUMetricsDto {
  @IsString()
  manufacturer: string;

  @IsString()
  brand: string;

  @IsNumber()
  cores: number;

  @IsNumber()
  physicalCores: number;

  @IsNumber()
  processors: number;

  @IsNumber()
  usage: number;

  @IsArray()
  usagePerCore: number[];

  @IsObject()
  @ValidateNested()
  @Type(() => LoadAverageDto)
  loadAverage: LoadAverageDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessInfoDto)
  topProcesses: ProcessInfoDto[];
}

export class MemoryMetricsDto {
  @IsNumber()
  total: number;

  @IsNumber()
  free: number;

  @IsNumber()
  used: number;

  @IsNumber()
  available: number;

  @IsNumber()
  usagePercent: number;

  @IsNumber()
  swapTotal: number;

  @IsNumber()
  swapFree: number;

  @IsNumber()
  swapUsed: number;

  @IsNumber()
  swapUsagePercent: number;

  @IsNumber()
  cached: number;

  @IsNumber()
  buffers: number;
}

export class FileSystemInfoDto {
  @IsString()
  fs: string;

  @IsString()
  type: string;

  @IsNumber()
  size: number;

  @IsNumber()
  used: number;

  @IsNumber()
  available: number;

  @IsNumber()
  usagePercent: number;

  @IsString()
  mount: string;
}

export class DiskMetricsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileSystemInfoDto)
  filesystems: FileSystemInfoDto[];
}

export class NetworkInterfaceDto {
  @IsString()
  iface: string;

  @IsString()
  ip4: string;

  @IsString()
  ip6: string;

  @IsString()
  mac: string;

  @IsNumber()
  rx_bytes: number;

  @IsNumber()
  tx_bytes: number;

  @IsNumber()
  rx_sec: number;

  @IsNumber()
  tx_sec: number;

  @IsString()
  operstate: string;
}

export class NetworkMetricsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NetworkInterfaceDto)
  interfaces: NetworkInterfaceDto[];

  @IsObject()
  connections: {
    active: number;
    listening: number;
  };

  @IsOptional()
  @IsString()
  publicIP: string | null;

  @IsArray()
  privateIPs: string[];
}

export class SystemInfoDto {
  @IsString()
  hostname: string;

  @IsString()
  platform: string;

  @IsString()
  distro: string;

  @IsString()
  kernel: string;

  @IsString()
  arch: string;

  @IsNumber()
  uptime: number;

  @IsNumber()
  bootTime: number;
}

export class MetricsDataDto {
  @IsObject()
  @ValidateNested()
  @Type(() => SystemInfoDto)
  system: SystemInfoDto;

  @IsObject()
  @ValidateNested()
  @Type(() => CPUMetricsDto)
  cpu: CPUMetricsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => MemoryMetricsDto)
  memory: MemoryMetricsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => DiskMetricsDto)
  disk: DiskMetricsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => NetworkMetricsDto)
  network: NetworkMetricsDto;
}
