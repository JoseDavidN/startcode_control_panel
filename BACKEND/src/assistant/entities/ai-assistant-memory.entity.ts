import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, OneToOne, JoinColumn, Index } from 'typeorm';
import { User } from '@auth/entities/user.entity';

/**
 * Memoria a largo plazo del asistente de un usuario: un resumen en texto de
 * la conversación antigua, que acompaña a cada pregunta.
 *
 * Va aparte de la configuración: desconectar o cambiar de proveedor no la
 * borra; solo «Borrar memoria».
 */
@Entity('tbl_ai_assistant_memory')
@Index('idx_ai_assistant_memory_user', ['userId'], { unique: true })
export class AiAssistantMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'str_user_id' })
  userId: string;

  @Column({ type: 'text', default: '', name: 'str_summary' })
  summary: string;

  /** Mensajes que ya entraron en el resumen, en total. */
  @Column({ type: 'int', default: 0, name: 'int_summarized_count' })
  summarizedCount: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
