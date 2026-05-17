// src/monitoring/entities/agent-metrics.entity.ts
import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Server } from '@servers/entities/server.entity';

/**
 * Entidad para almacenar métricas actuales del agente
 *
 * Esta tabla guarda UN SOLO REGISTRO por servidor con las métricas más recientes
 * Se actualiza cada vez que el agente envía nuevas métricas
 */
@Entity('tbl_agent_metrics')
export class AgentMetrics {
  @Column('uuid', { primary: true, name: 'server_id' })
  server_id: string;

  @ManyToOne(() => Server, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'server_id' })
  server: Server;

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  // ==================== CPU ====================
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  cpu_usage: number;

  @Column('jsonb', { nullable: true })
  cpu_usage_per_core: number[];

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  cpu_load_average_1m: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  cpu_load_average_5m: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  cpu_load_average_15m: number;

  // ==================== MEMORIA ====================
  @Column('bigint', { nullable: true })
  memory_total: number;

  @Column('bigint', { nullable: true })
  memory_used: number;

  @Column('bigint', { nullable: true })
  memory_free: number;

  @Column('bigint', { nullable: true })
  memory_available: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  memory_usage_percent: number;

  @Column('bigint', { nullable: true })
  swap_total: number;

  @Column('bigint', { nullable: true })
  swap_used: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  swap_usage_percent: number;

  // ==================== DISCO ====================
  @Column('jsonb', { nullable: true })
  disk_filesystems: any;

  // ==================== RED ====================
  @Column('varchar', { length: 45, nullable: true })
  network_public_ip: string;

  @Column('jsonb', { nullable: true })
  network_private_ips: string[];

  @Column('int', { nullable: true })
  network_connections_active: number;

  @Column('int', { nullable: true })
  network_connections_listening: number;

  // ==================== SISTEMA ====================
  @Column('varchar', { length: 255, nullable: true })
  system_hostname: string;

  @Column('varchar', { length: 50, nullable: true })
  system_platform: string;

  @Column('varchar', { length: 255, nullable: true })
  system_distro: string;

  @Column('varchar', { length: 100, nullable: true })
  system_kernel: string;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  system_uptime: number;

  @Column('timestamp', { nullable: true })
  system_boot_time: Date;

  // ==================== PROCESOS ====================
  @Column('int', { nullable: true, default: 0 })
  processes_total: number;

  @Column('int', { nullable: true, default: 0 })
  processes_running: number;

  @Column('int', { nullable: true, default: 0 })
  processes_sleeping: number;

  @Column('int', { nullable: true, default: 0 })
  processes_stopped: number;

  @Column('int', { nullable: true, default: 0 })
  processes_zombie: number;

  @Column('jsonb', { nullable: true })
  processes_top_list: any;

  // ==================== SERVICIOS ====================
  @Column('int', { nullable: true, default: 0 })
  services_count: number;

  @Column('jsonb', { nullable: true })
  services_list: any;

  // ==================== SITIOS WEB ====================
  @Column('int', { nullable: true, default: 0 })
  websites_count: number;

  @Column('jsonb', { nullable: true })
  websites_list: any;

  // ==================== BASES DE DATOS ====================
  @Column('int', { nullable: true, default: 0 })
  databases_count: number;

  @Column('jsonb', { nullable: true })
  databases_list: any;

  // ==================== METADATA ====================
  @Column('varchar', { length: 50, nullable: true })
  agent_version: string;

  @Column('varchar', { length: 100, nullable: true })
  message_id: string;

  @Column('varchar', { length: 50, nullable: true })
  message_type: string;
}
