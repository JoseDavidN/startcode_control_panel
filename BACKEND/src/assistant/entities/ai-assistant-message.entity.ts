import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '@auth/entities/user.entity';
import { AiProvider } from './ai-assistant-config.entity';

export enum AiMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

/**
 * Un mensaje de la conversación con el asistente de un usuario.
 *
 * La memoria vive aquí y no en el proveedor: se guarda como texto plano
 * (rol + contenido), así que al cambiar de Anthropic a OpenAI o Gemini el
 * modelo nuevo recibe la misma conversación. Las preguntas se guardan ya sin
 * secretos (`redactSecrets`); el contexto de pantalla adjunto no se guarda.
 */
@Entity('tbl_ai_assistant_messages')
@Index('idx_ai_assistant_messages_user_created', ['userId', 'createdAt'])
export class AiAssistantMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'str_user_id' })
  userId: string;

  @Column({ type: 'enum', enum: AiMessageRole, name: 'enu_role' })
  role: AiMessageRole;

  @Column({ type: 'text', name: 'str_content' })
  content: string;

  /** Proveedor y modelo que escribieron la respuesta (null en las preguntas). */
  @Column({ type: 'enum', enum: AiProvider, nullable: true, name: 'enu_provider' })
  provider: AiProvider | null;

  @Column({ type: 'varchar', length: 128, nullable: true, name: 'str_model' })
  model: string | null;

  /** Ya forma parte del resumen de memoria: se muestra, pero no se reenvía al modelo. */
  @Column({ type: 'boolean', default: false, name: 'bol_summarized' })
  summarized: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'dat_created_at' })
  createdAt: Date;
}
