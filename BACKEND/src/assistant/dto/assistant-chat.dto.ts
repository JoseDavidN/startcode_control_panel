import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const CHAT_ROLES = ['user', 'assistant'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** Lo que el cliente puede adjuntar de la pantalla abierta. Solo lectura. */
export const CONTEXT_TYPES = ['terminal', 'command_output', 'sql_editor', 'sql_result', 'schema', 'page'] as const;
export type ContextType = (typeof CONTEXT_TYPES)[number];

export class ChatContextItemDto {
  @ApiProperty({ enum: CONTEXT_TYPES })
  @IsIn(CONTEXT_TYPES)
  type: ContextType;

  @ApiProperty({ example: 'Terminal · web-01' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40_000)
  content: string;
}

export class AssistantChatDto {
  @ApiProperty({ description: 'Pregunta nueva. La conversación anterior la recuerda el backend.' })
  @IsString()
  @IsNotEmpty({ message: 'Escribe una pregunta' })
  @MaxLength(20_000)
  message: string;

  @ApiPropertyOptional({ type: [ChatContextItemDto], description: 'Terminal, salida de comandos, editor y resultados SQL visibles. No se guarda.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ChatContextItemDto)
  context?: ChatContextItemDto[];
}
