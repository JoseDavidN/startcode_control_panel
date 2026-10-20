import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '@auth/entities/user.entity';

export enum ServerStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
  ERROR = 'error',
  WARNING = 'warning',
  PENDING = 'pending',
  CHECKING = 'checking',
}

/** Estado de la instalación del agente en la máquina remota. */
export interface ServerAgentMetadata {
  state: 'not_installed' | 'installing' | 'installed' | 'failed' | 'uninstalling';
  version?: string;
  arch?: 'amd64' | 'arm64';
  installedAt?: string;
  lastAttemptAt?: string;
  lastError?: { code: string; message: string; detail?: string; at: string };
  steps?: { id: string; label: string; status: string; detail?: string }[];
}

export enum ServerOs {
  UBUNTU = 'ubuntu',
  CENTOS = 'centos',
  DEBIAN = 'debian',
  FEDORA = 'fedora',
  ARCH = 'arch',
  SOLARIS = 'solaris',
  OPENBSD = 'openbsd',
  NETBSD = 'netbsd',
  FREEBSD = 'freebsd',
  OTHER = 'other',
}

/** Clasificación del servidor. Lista cerrada: el usuario elige una, no la escribe. */
export enum ServerTag {
  PRODUCTION = 'production',
  STAGING = 'staging',
  TESTING = 'testing',
  DEVELOPMENT = 'development',
  BACKUP = 'backup',
}

@Entity('tbl_servers')
export class Server {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'str_name' })
  name: string;

  @Column({ name: 'str_host' })
  host: string;

  @Column({ default: 22, name: 'int_port' })
  port: number;

  @Column({ name: 'str_username' })
  username: string;

  @Column({ type: 'text', select: false, name: 'str_privatekey' })
  privateKey: string;

  @Column({ type: 'enum', enum: ServerStatus, default: ServerStatus.OFFLINE, name: 'enu_status' })
  status: ServerStatus;

  @Column({ type: 'enum', enum: ServerOs, name: 'enu_os' })
  os: ServerOs;

  /** Una sola etiqueta por servidor, opcional. */
  @Column({ type: 'enum', enum: ServerTag, nullable: true, name: 'enu_tag' })
  tag: ServerTag | null;

  /** Marcado como favorito (hasta 3 por usuario): la lista los pone primero, por esta fecha. */
  @Column({ type: 'timestamptz', nullable: true, name: 'dat_favorited' })
  favoritedAt: Date | null;

  @Column({ type: 'text', nullable: true, name: 'str_description' })
  description: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'json_metadata' })
  metadata: {
    /* Aquí NO van métricas: cpu/memoria/disco viven en tbl_agent_metrics, que
       es lo que leen el detalle, el dashboard y la lista. El tipo llegó a
       declararlas y nadie las escribía nunca, así que la lista enseñaba 0 %. */
    osVersion?: string;
    activeServices?: number;
    agent?: ServerAgentMetadata;
    /** Unidades systemd que el usuario quiere ver primero en este servidor. */
    pinnedServices?: string[];
  } | null;

  /* `timestamptz`: la columna guarda un instante, y el driver lo convierte en
     los dos sentidos. Con `timestamp` a secas se escribía la hora UTC como si
     fuera local y al leerla se desplazaba por el huso, así que el cron de
     inactividad comparaba fechas con horas de diferencia y nunca marcaba nada
     como offline. */
  @Column({ type: 'timestamptz', nullable: true, name: 'dat_last_seen' })
  lastSeen: Date | null;

  @Column({ type: 'text', nullable: true, name: 'str_hostname' })
  hostname: string | null;

  @Column({ type: 'text', nullable: true, name: 'str_os_version' })
  osVersion: string | null;

  @Column({ type: 'text', nullable: true, name: 'str_kernel_version' })
  kernelVersion: string | null;

  /* Clave de host SSH fijada con TOFU (ver monitoring/services/host-key.ts).
     No es secreta: es lo que el usuario compara con `ssh-keygen -lf`. */
  @Column({ type: 'text', nullable: true, name: 'str_host_key_algorithm' })
  hostKeyAlgorithm: string | null;

  /** `SHA256:<base64>`, como OpenSSH. null hasta la primera conexión. */
  @Column({ type: 'text', nullable: true, name: 'str_host_key_fingerprint' })
  hostKeyFingerprint: string | null;

  /** Cuándo se fijó o se aceptó la clave actual. */
  @Column({ type: 'timestamptz', nullable: true, name: 'dat_host_key_verified' })
  hostKeyVerifiedAt: Date | null;

  @ManyToOne(() => User, (user) => user.servers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_owner_id' })
  owner: User;

  @Column({ name: 'str_owner_id' })
  ownerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastCheckAt: Date | null;

  /* ── Token del agente (ver servers/services/agent-token.service.ts) ──
     Solo identificadores (`jti`, o `sha256:` del token heredado), nunca el
     token. `select: false`: los lee y escribe únicamente AgentTokenService, con
     UPDATE atómicos; así un `save()` de una entidad vieja no pisa una rotación. */

  /** Token vigente. null = ninguno válido (revocado o nunca emitido). */
  @Column({ type: 'varchar', length: 80, nullable: true, select: false, name: 'str_agent_token_id' })
  agentTokenId: string | null;

  /** Emitido y enviado al agente, a la espera de su ACK. */
  @Column({ type: 'varchar', length: 80, nullable: true, select: false, name: 'str_agent_token_pending_id' })
  agentTokenPendingId: string | null;

  /** El anterior a la última rotación, aceptado hasta `agentTokenPreviousUntil`. */
  @Column({ type: 'varchar', length: 80, nullable: true, select: false, name: 'str_agent_token_previous_id' })
  agentTokenPreviousId: string | null;

  @Column({ type: 'timestamptz', nullable: true, select: false, name: 'dat_agent_token_previous_until' })
  agentTokenPreviousUntil: Date | null;

  /** Cuándo se emitió el vigente: decide la rotación periódica. */
  @Column({ type: 'timestamptz', nullable: true, select: false, name: 'dat_agent_token_issued' })
  agentTokenIssuedAt: Date | null;

  /** Admite tokens sin `jti` (anteriores a 0.11.1) hasta su primera conexión.
      `true` por defecto también en filas nuevas, para que `synchronize` no deje
      fuera a los agentes ya instalados: es seguro porque el panel ya no emite
      tokens sin `jti`, así que para un servidor nuevo no existe ninguno. */
  @Column({ type: 'boolean', default: true, select: false, name: 'bol_agent_token_legacy' })
  agentTokenLegacy: boolean;
}
