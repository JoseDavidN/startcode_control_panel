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
import { Server } from '@servers/entities/server.entity';

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

/** Cómo llega el panel al motor: directo o por un túnel SSH. */
export enum DatabaseSshMode {
  NONE = 'none',
  /** Por un servidor ya dado de alta en el panel (su llave y su huella confirmada). */
  SERVER = 'server',
  /** Con credenciales SSH propias de la conexión. */
  CUSTOM = 'custom',
}

export enum DatabaseSshAuth {
  PASSWORD = 'password',
  KEY = 'key',
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

  /* ── Túnel SSH ──────────────────────────────────────────────────
     Con túnel, `host` y `port` son los del motor vistos desde el servidor
     SSH (normalmente 127.0.0.1). */
  @Column({ type: 'enum', enum: DatabaseSshMode, default: DatabaseSshMode.NONE, name: 'enu_ssh_mode' })
  sshMode: DatabaseSshMode;

  /** Servidor del panel por el que pasa el túnel (`SERVER`). Si se borra, la conexión queda sin túnel válido. */
  @ManyToOne(() => Server, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'str_ssh_server_id' })
  sshServer: Server | null;

  @Column({ type: 'uuid', nullable: true, name: 'str_ssh_server_id' })
  sshServerId: string | null;

  /* Credenciales propias (`CUSTOM`). */
  @Column({ type: 'varchar', nullable: true, name: 'str_ssh_host' })
  sshHost: string | null;

  @Column({ type: 'int', nullable: true, name: 'int_ssh_port' })
  sshPort: number | null;

  @Column({ type: 'varchar', nullable: true, name: 'str_ssh_username' })
  sshUsername: string | null;

  @Column({ type: 'enum', enum: DatabaseSshAuth, nullable: true, name: 'enu_ssh_auth' })
  sshAuth: DatabaseSshAuth | null;

  /** Contraseña o llave privada SSH, cifrada como la de la base. `select: false`. */
  @Column({ type: 'text', nullable: true, select: false, name: 'str_ssh_secret_enc' })
  sshSecretEnc: string | null;

  /** Huella que el usuario confirmó al configurar el túnel: sin ella no se autentica. */
  @Column({ type: 'varchar', nullable: true, name: 'str_ssh_host_key_fingerprint' })
  sshHostKeyFingerprint: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'str_ssh_host_key_algorithm' })
  sshHostKeyAlgorithm: string | null;

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
