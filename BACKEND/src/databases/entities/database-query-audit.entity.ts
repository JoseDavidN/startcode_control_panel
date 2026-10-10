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
import { DatabaseConnection } from './database-connection.entity';

export enum DatabaseQueryAuditStatus {
  OK = 'ok',
  /** El motor rechazó la sentencia o no se pudo conectar. */
  ERROR = 'error',
}

/**
 * Una fila por consulta peligrosa confirmada en el editor SQL: quién, sobre
 * qué conexión y base, qué sentencia, por qué se consideró peligrosa y cómo
 * terminó. Los resultados no se guardan.
 */
@Entity('tbl_database_query_audit')
@Index('idx_database_query_audit_connection_created', ['connectionId', 'createdAt'])
export class DatabaseQueryAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'str_user_id' })
  userId: string;

  @ManyToOne(() => DatabaseConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_connection_id' })
  connection: DatabaseConnection;

  @Column({ type: 'uuid', name: 'str_connection_id' })
  connectionId: string;

  @Column({ type: 'varchar', nullable: true, name: 'str_schema' })
  schema: string | null;

  @Column({ type: 'text', name: 'str_query' })
  query: string;

  /** Motivo por el que pidió confirmación. */
  @Column({ type: 'varchar', name: 'str_reason' })
  reason: string;

  @Column({ type: 'varchar', length: 16, name: 'str_status' })
  status: DatabaseQueryAuditStatus;

  @Column({ type: 'int', nullable: true, name: 'int_affected_rows' })
  affectedRows: number | null;

  @Column({ type: 'text', nullable: true, name: 'str_error' })
  error: string | null;

  @Column({ type: 'int', default: 0, name: 'int_duration_ms' })
  durationMs: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'dat_created_at' })
  createdAt: Date;
}
