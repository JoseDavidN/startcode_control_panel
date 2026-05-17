import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { Server } from '@servers/entities/server.entity';

/**
 * Serie temporal de métricas de rendimiento por servidor.
 *
 * Se inserta un registro por cada mensaje METRICS recibido del agente.
 * Solo almacena métricas numéricas útiles para gráficos de tendencia —
 * los inventarios de servicios, procesos y sitios se guardan únicamente
 * en tbl_agent_metrics (snapshot actual).
 *
 * Retención por defecto: 30 días.
 * Índice compuesto (server_id, timestamp) para rangos eficientes.
 */
@Entity('tbl_agent_metrics_history')
@Index('idx_agent_metrics_history_server_ts', ['server_id', 'timestamp'])
export class AgentMetricsHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'server_id' })
  server_id: string;

  @ManyToOne(() => Server, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'server_id' })
  server: Server;

  @CreateDateColumn({ type: 'timestamp' })
  timestamp: Date;

  // CPU
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  cpu_usage: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  cpu_load_average_1m: number;

  // Memoria
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  memory_usage_percent: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  swap_usage_percent: number;

  // Disco — porcentaje del filesystem raíz (denormalizado para evitar JSONB en historia)
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  disk_usage_percent: number;

  // Red
  @Column('int', { nullable: true })
  network_connections_active: number;

  // Sistema
  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  system_uptime: number;
}
