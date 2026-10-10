import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AiProvider } from '../entities/ai-assistant-config.entity';

export class UpsertAssistantConfigDto {
  @ApiProperty({ enum: AiProvider, example: AiProvider.ANTHROPIC })
  @IsEnum(AiProvider, { message: 'Proveedor no soportado: solo Anthropic, OpenAI (ChatGPT) o Google Gemini' })
  provider: AiProvider;

  @ApiProperty({ example: 'claude-opus-5-5' })
  @IsString()
  @IsNotEmpty({ message: 'Indica el modelo' })
  @MaxLength(128)
  @Matches(/^[\w.:-]+$/, { message: 'El nombre del modelo solo admite letras, números, «.», «-», «_» y «:»' })
  model: string;

  @ApiPropertyOptional({ description: 'Obligatoria al crear o al cambiar de proveedor; sin ella se conserva la guardada' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La clave de API parece incompleta' })
  @MaxLength(512)
  apiKey?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
