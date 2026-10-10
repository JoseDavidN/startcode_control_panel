import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '@auth/entities/user.entity';

export enum DatabaseEngine {
  MYSQL = 'mysql',
  MARIADB = 'mariadb',
  POSTGRESQL = 'postgresql',
  REDIS = 'redis',
}

export enum DatabaseConnectionStatus {
  /** Recién creada o editada y todavía sin comprobar. */
  UNKNOWN = 'unknown',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}

/** Clasificación de la conexión, la misma lista que en servidores. Cerrada: se elige, no se escribe. */
export enum DatabaseTag {
  PRODUCTION = 'production',
  STAGING = 'staging',
  TESTING = 'testing',
  DEVELOPMENT = 'development',
  BACKUP = 'backup',
}

@Entity('tbl_database_connections')
@Index('idx_database_connections_user', ['userId'])
export class DatabaseConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Usuario que creó la conexión: solo él la ve, la edita o la usa. */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_user_id' })
  user: User;

  @Column({ name: 'str_user_id' })
  userId: string;

  @Column({ name: 'str_name' })
  name: string;

  @Column({ type: 'enum', enum: DatabaseEngine, name: 'enu_engine' })
  engine: DatabaseEngine;

  @Column({ name: 'str_host' })
  host: string;

  @Column({ type: 'int', name: 'int_port' })
  port: number;

  @Column({ name: 'str_username', default: '' })
  username: string;

  /* Cifrada con AES-256-GCM (`CredentialsCipherService`). `select: false`:
     ninguna consulta la trae salvo las que la piden a propósito (revelarla
     en el formulario y abrir la conexión). */
  @Column({ type: 'text', nullable: true, select: false, name: 'str_password_enc' })
  passwordEnc: string | null;

  /** Una sola etiqueta por conexión, opcional. */
  @Column({ type: 'enum', enum: DatabaseTag, nullable: true, name: 'enu_tag' })
  tag: DatabaseTag | null;

  /** Base a la que apunta; null conecta al servidor completo. En Redis, el índice. */
  @Column({ type: 'varchar', nullable: true, name: 'str_database' })
  database: string | null;

  @Column({
    type: 'enum',
    enum: DatabaseConnectionStatus,
    default: DatabaseConnectionStatus.UNKNOWN,
    name: 'enu_status',
  })
  status: DatabaseConnectionStatus;

  /** Versión que reportó el motor en la última comprobación correcta. */
  @Column({ type: 'varchar', nullable: true, name: 'str_version' })
  version: string | null;

  @Column({ type: 'text', nullable: true, name: 'str_last_error' })
  lastError: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'dat_last_checked' })
  lastCheckedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
