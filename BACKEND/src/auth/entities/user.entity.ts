import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Server } from '@servers/entities/server.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer'
}

@Entity('tbl_users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'str_firstname' })
  firstname: string;

  @Column({ name: 'str_lastname' })
  lastname: string;

  @Column({ unique: true, name: 'str_email' })
  email: string;

  @Column({ name: 'str_password' })
  @Exclude()
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER, name: 'enu_role' })
  role: UserRole;

  @Column({ default: true, name: 'bol_is_active' })
  isActive: boolean;

  @Column({ default: false, name: 'bol_two_factor_enabled' })
  twoFactorEnabled: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'str_two_factor_secret' })
  @Exclude()
  twoFactorSecret: string | null;

  @OneToMany(() => Server, (server) => server.owner)
  servers: Server[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
