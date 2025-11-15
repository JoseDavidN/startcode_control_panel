import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Server } from '../../servers/entities/server.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer'
}

@Entity('tbl_users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  str_firstname: string;

  @Column()
  str_lastname: string;

  @Column({ unique: true })
  str_email: string;

  @Column()
  @Exclude()
  str_password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  enu_role: UserRole;

  @Column({ default: true })
  bol_is_active: boolean;

  @OneToMany(() => Server, (server) => server.str_owner)
  servers: Server[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}