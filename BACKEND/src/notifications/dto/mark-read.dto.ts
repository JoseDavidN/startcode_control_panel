import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class MarkReadDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Ids a marcar como leídas. Se ignora si `all` es true.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: 'Marcar todas las del usuario', example: true })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
