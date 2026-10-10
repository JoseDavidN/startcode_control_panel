import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, IsUUID } from 'class-validator';

export class RunQueryDto {
  @ApiProperty({ example: 'SELECT * FROM tbl_users LIMIT 10' })
  @IsString()
  @IsNotEmpty({ message: 'La consulta está vacía' })
  @MaxLength(100_000)
  sql: string;

  @ApiPropertyOptional({ example: 'db_startcode', description: 'Base sobre la que se ejecuta' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  schema?: string;

  @ApiPropertyOptional({
    description: 'El usuario confirmó una sentencia peligrosa (sin esto responde 400 `DANGEROUS_QUERY`)',
  })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @ApiPropertyOptional({ description: 'Sesión de la vista de consultas; sin ella se abre una conexión para esta llamada' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
