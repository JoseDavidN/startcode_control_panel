import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Una fila por sesión iniciada. El `sid` viaja dentro del access token y del
 * refresh token, de modo que revocar la fila invalida ambos de inmediato:
 * sin esto, un JWT emitido seguiría siendo válido hasta su expiración.
 */
@Entity('tbl_sessions')
@Index('idx_sessions_user', ['userId'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_user_id' })
  user: User;

  @Column({ name: 'str_user_id' })
  userId: string;

  /** sha256 del refresh token vigente. Se rota en cada refresh. */
  @Column({ type: 'varchar', length: 64, name: 'str_refresh_hash' })
  refreshHash: string;

  /** sha256 del refresh anterior: aceptado unos segundos tras rotar; después, usarlo revoca la sesión. */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'str_previous_refresh_hash' })
  previousRefreshHash: string | null;

  /** Cuándo se rotó el refresh por última vez: inicio de la gracia del anterior. */
  @Column({ type: 'timestamptz', nullable: true, name: 'dat_refresh_rotated_at' })
  refreshRotatedAt: Date | null;

  @Column({ type: 'text', nullable: true, name: 'str_user_agent' })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'str_ip' })
  ip: string | null;

  /* timestamptz y no timestamp: la base de datos corre en UTC y el servidor en
     otra zona, así que una marca sin zona se leía con horas de desfase y el
     cálculo de inactividad salía negativo. */

  /** Última petición autenticada: base del cierre por inactividad. */
  @Column({ type: 'timestamptz', name: 'dat_last_used' })
  lastUsed: Date;

  @Column({ type: 'timestamptz', name: 'dat_expires_at' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: false, name: 'bol_revoked' })
  revoked: boolean;

  /** "Mantener sesión iniciada": TTL largo y sin cierre por inactividad. */
  @Column({ type: 'boolean', default: false, name: 'bol_persistent' })
  persistent: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
