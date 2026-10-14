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

export enum NotificationType {
  SERVER_OFFLINE = 'server_offline',
  SERVER_ONLINE = 'server_online',
  CPU_HIGH = 'cpu_high',
  MEMORY_HIGH = 'memory_high',
  DISK_HIGH = 'disk_high',
  SECURITY = 'security',
  SYSTEM = 'system',
}

export enum NotificationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

@Entity('tbl_notifications')
@Index('idx_notifications_user_created', ['userId', 'createdAt'])
@Index('idx_notifications_user_read', ['userId', 'read'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_user_id' })
  user: User;

  @Column({ name: 'str_user_id' })
  userId: string;

  /** Opcional: las notificaciones de sistema o de seguridad no cuelgan de un servidor. */
  @ManyToOne(() => Server, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'str_server_id' })
  server: Server | null;

  @Column({ type: 'uuid', nullable: true, name: 'str_server_id' })
  serverId: string | null;

  @Column({ type: 'enum', enum: NotificationType, name: 'enu_type' })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationSeverity,
    default: NotificationSeverity.INFO,
    name: 'enu_severity',
  })
  severity: NotificationSeverity;

  @Column({ name: 'str_title' })
  title: string;

  @Column({ type: 'text', name: 'str_body' })
  body: string;

  /** Contexto de la alerta: nombre del servidor y el valor que la disparó. */
  @Column({ type: 'jsonb', nullable: true, name: 'json_metadata' })
  metadata: {
    serverName?: string;
    value?: number;
    threshold?: number;
    /** Inicio de sesión: IP, dispositivo y sesión. */
    ip?: string | null;
    device?: string;
    sessionId?: string;
  } | null;

  @Column({ type: 'boolean', default: false, name: 'bol_read' })
  read: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'dat_read_at' })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
