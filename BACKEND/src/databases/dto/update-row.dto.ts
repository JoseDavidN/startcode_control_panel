import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, IsUUID } from 'class-validator';

/** Edición de una celda (o varias) de una fila del resultado. */
export class UpdateRowDto {
  @ApiProperty({ example: 'db_startcode' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  schema: string;

  @ApiPropertyOptional({ example: 'public', description: 'Esquema de PostgreSQL (por defecto `public`); MySQL no lo usa' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  namespace?: string;

  @ApiProperty({ example: 'usuarios' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  table: string;

  @ApiProperty({ description: 'Clave primaria completa de la fila: { columna: valor original }', example: { id: 15 } })
  @IsObject()
  key: Record<string, unknown>;

  @ApiProperty({ description: 'Columnas a cambiar: { columna: valor nuevo | null }', example: { email: 'a@b.com' } })
  @IsObject()
  changes: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Sesión de la vista de consultas; sin ella se abre una conexión para esta llamada' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
