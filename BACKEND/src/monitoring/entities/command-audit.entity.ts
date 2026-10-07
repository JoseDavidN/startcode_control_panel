import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '@auth/entities/user.entity';
import { Server } from '@servers/entities/server.entity';

export enum CommandAuditStatus {
  /** Terminó con código 0. */
  OK = 'ok',
  /** Terminó con código distinto de 0. */
  ERROR = 'error',
  /** Superó el tiempo máximo y se cortó. */
  TIMEOUT = 'timeout',
  /** No llegó a ejecutarse: SSH, sudo o rechazo previo. */
  FAILED = 'failed',
}

/**
 * Una fila por comando lanzado desde la línea de comandos del panel: quién,
 * en qué servidor, qué, dónde y cómo terminó. La salida no se guarda: puede
 * contener secretos y la auditoría no la necesita.
 */
@Entity('tbl_command_audit')
@Index('idx_command_audit_server_created', ['serverId', 'createdAt'])
export class CommandAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'str_user_id' })
  userId: string;

  @ManyToOne(() => Server, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_server_id' })
  server: Server;

  @Column({ type: 'uuid', name: 'str_server_id' })
  serverId: string;

  @Column({ type: 'text', name: 'str_command' })
  command: string;

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'str_cwd' })
  cwd: string | null;

  @Column({ type: 'boolean', default: false, name: 'bol_sudo' })
  sudo: boolean;

  @Column({ type: 'varchar', length: 16, name: 'str_status' })
  status: CommandAuditStatus;

  @Column({ type: 'int', nullable: true, name: 'int_exit_code' })
  exitCode: number | null;

  @Column({ type: 'int', default: 0, name: 'int_duration_ms' })
  durationMs: number;

  @Column({ type: 'boolean', default: false, name: 'bol_truncated' })
  truncated: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'dat_created_at' })
  createdAt: Date;
}
