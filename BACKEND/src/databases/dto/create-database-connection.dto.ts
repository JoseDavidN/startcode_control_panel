import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DatabaseEngine } from '../entities/database-connection.entity';

export class CreateDatabaseConnectionDto {
  @ApiProperty({ enum: DatabaseEngine, example: DatabaseEngine.POSTGRESQL })
  @IsEnum(DatabaseEngine, { message: 'Motor no soportado' })
  engine: DatabaseEngine;

  @ApiProperty({ example: 'StartCode producción' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MaxLength(100, { message: 'El nombre debe tener menos de 100 caracteres' })
  name: string;

  @ApiProperty({ example: '10.0.0.12' })
  @IsString()
  @IsNotEmpty({ message: 'El host es requerido' })
  @MaxLength(255)
  host: string;

  @ApiProperty({ example: 5432 })
  @IsInt()
  @Min(1, { message: 'El puerto debe ser mayor a 0' })
  @Max(65535, { message: 'El puerto debe ser menor a 65535' })
  port: number;

  @ApiPropertyOptional({ example: 'startcode', description: 'Opcional en Redis' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  username?: string;

  @ApiPropertyOptional({
    description:
      'Se guarda cifrada. En una edición: omitida conserva la actual, cadena vacía la borra.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  password?: string;

  @ApiPropertyOptional({
    example: 'db_startcode',
    description: 'Base concreta; vacía conecta al servidor completo. En Redis, índice 0–15.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  database?: string;
}
