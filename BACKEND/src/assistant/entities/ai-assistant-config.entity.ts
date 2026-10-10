import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '@auth/entities/user.entity';

export enum AiProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  GEMINI = 'gemini',
}

/**
 * Asistente de IA de un usuario (tab Configuración → Asistente IA).
 *
 * Uno por usuario: cada cuenta conecta su propio proveedor con su propia
 * clave, y el asistente solo ve los datos de esa cuenta.
 */
@Entity('tbl_ai_assistant_configs')
@Index('idx_ai_assistant_configs_user', ['userId'], { unique: true })
export class AiAssistantConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'str_user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'str_user_id' })
  userId: string;

  @Column({ type: 'enum', enum: AiProvider, name: 'enu_provider' })
  provider: AiProvider;

  @Column({ type: 'varchar', length: 128, name: 'str_model' })
  model: string;

  /* Cifrada con AES-256-GCM (`CredentialsCipherService`). `select: false`:
     solo la lee quien llama al proveedor; nunca vuelve al cliente. */
  @Column({ type: 'text', select: false, name: 'str_api_key_enc' })
  apiKeyEnc: string;

  /** Últimos 4 caracteres de la clave, para reconocerla en el formulario. */
  @Column({ type: 'varchar', length: 8, name: 'str_api_key_hint' })
  apiKeyHint: string;

  @Column({ type: 'boolean', default: true, name: 'bol_enabled' })
  enabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
