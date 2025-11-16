import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum ServerStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
  ERROR = 'error',
  WARNING = 'warning',
  PENDING = 'pending',
  CHECKING = 'checking',
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

@Entity('tbl_servers')
export class Server {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  str_name: string;

  @Column()
  str_host: string;

  @Column({ default: 22 })
  int_port: number;

  @Column()
  str_username: string;

  @Column({ type: 'text', select: false })
  str_privatekey: string;

  @Column({ type: 'enum', enum: ServerStatus, default: ServerStatus.OFFLINE })
  enu_status: ServerStatus;

  @Column({ type: 'enum', enum: ServerOs })
  enu_os: ServerOs;

  @Column({ type: 'text', nullable: true })
  str_description: string;

  @Column({ type: 'jsonb', nullable: true })
  json_metadata: {
    cpu?: number;
    memory?: number;
    disk?: number;
    uptime?: string;
    osVersion?: string;
  };

  @ManyToOne(() => User, (user) => user.servers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_owner_id' })
  str_owner: User;

  @Column({ name: 'str_owner_id' })
  str_owner_id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastCheckAt: Date;
}
