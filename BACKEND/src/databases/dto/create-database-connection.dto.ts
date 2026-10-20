import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DatabaseEngine, DatabaseTag } from '../entities/database-connection.entity';
import { IsHost } from '@/common/security/network';

/* Sin bytes nulos ni caracteres de control: los drivers cortan o malinterpretan el valor. */
// eslint-disable-next-line no-control-regex
const NO_CONTROL = /^[^\x00-\x1f\x7f]*$/;

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
  @MaxLength(253)
  @IsHost()
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
  @Matches(NO_CONTROL, { message: 'El usuario no puede llevar caracteres de control' })
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
  @Matches(NO_CONTROL, { message: 'El nombre de la base no puede llevar caracteres de control' })
  database?: string;

  @ApiPropertyOptional({ enum: DatabaseTag, nullable: true, description: 'Una sola, opcional. null la quita' })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEnum(DatabaseTag, { message: 'La etiqueta debe ser un valor válido' })
  tag?: DatabaseTag | null;
}
