import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AiProvider } from '../entities/ai-assistant-config.entity';

/* POST y no GET: la clave no debe viajar en la URL (acaba en logs y proxies). */
export class ListModelsDto {
  @ApiProperty({ enum: AiProvider })
  @IsEnum(AiProvider, { message: 'Proveedor no soportado: solo Anthropic, OpenAI (ChatGPT) o Google Gemini' })
  provider: AiProvider;

  @ApiPropertyOptional({ description: 'Clave a usar; sin ella, la guardada si es del mismo proveedor' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La clave de API parece incompleta' })
  @MaxLength(512)
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Ignorar la caché y preguntar de nuevo al proveedor' })
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}
