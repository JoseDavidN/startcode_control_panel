import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Tabla de la que se piden las columnas o en la que se inserta. */
export class TableRefDto {
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

  @ApiPropertyOptional({ description: 'Sesión de la vista de consultas; sin ella se abre una conexión para esta llamada' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

/** Fila nueva: solo las columnas que se escriben; las demás toman su valor por defecto. */
export class InsertRowDto extends TableRefDto {
  @ApiProperty({ description: 'Columnas a escribir: { columna: valor | null }', example: { email: 'a@b.com', activo: 1 } })
  @IsObject()
  values: Record<string, unknown>;
}

/** Filas a borrar, cada una por su clave primaria completa. */
export class DeleteRowsDto extends TableRefDto {
  @ApiProperty({ description: 'Clave primaria completa de cada fila: [{ columna: valor original }]', example: [{ id: 15 }, { id: 16 }] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsObject({ each: true })
  /* Sin esto, la conversión implícita del ValidationPipe convierte cada objeto en [] (el tipo reflejado es Array). */
  @Type(() => Object)
  keys: Record<string, unknown>[];
}
