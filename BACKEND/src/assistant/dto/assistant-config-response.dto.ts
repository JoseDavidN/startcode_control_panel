import { ApiProperty } from '@nestjs/swagger';
import { AiProvider } from '../entities/ai-assistant-config.entity';

/** Configuración del asistente tal como la ve el cliente: nunca lleva la clave. */
export class AssistantConfigResponseDto {
  @ApiProperty({ enum: AiProvider })
  provider: AiProvider;

  @ApiProperty()
  model: string;

  @ApiProperty({ example: '…a1B2', description: 'Últimos 4 caracteres de la clave guardada' })
  apiKeyHint: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  updatedAt: Date;
}
