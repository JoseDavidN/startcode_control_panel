import { IsString, IsNumber, IsEnum, IsOptional, ValidateIf, IsNotEmpty, MinLength, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ServerOs, ServerTag } from '../entities/server.entity';

export class CreateServerDto {
  @ApiProperty({
    description: 'Nombre del servidor',
    example: 'Server production 1',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'El nombre debe tener menos de 100 caracteres' })
  name: string;

  @ApiProperty({ description: 'Host del servidor', example: '192.168.1.1' })
  @IsString()
  @IsNotEmpty({ message: 'El host es requerido' })
  host: string;

  @ApiProperty({ description: 'Puerto del servidor', example: 22, default: 22 })
  @IsNumber()
  @Min(1, { message: 'El puerto debe ser mayor a 0' })
  @Max(65535, { message: 'El puerto debe ser menor a 65535' })
  @IsOptional({ message: 'El puerto es opcional' })
  port?: number;

  @ApiProperty({ description: 'Usuario del servidor', example: 'root' })
  @IsString()
  @IsNotEmpty({ message: 'El usuario es requerido' })
  username: string;

  @ApiProperty({
    description: 'Clave privada del servidor (Se almacena de forma segura)',
    example:
      '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----'
  })
  @IsString()
  @IsNotEmpty({ message: 'La clave privada es requerida' })
  privateKey: string;

  @ApiProperty({
    description: 'Sistema operativo del servidor',
    example: ServerOs.UBUNTU,
  })
  @IsEnum(ServerOs, { message: 'El sistema operativo debe ser un valor válido' })
  os: ServerOs;

  @ApiProperty({
    description: 'Etiqueta del servidor (una sola, opcional). null la quita',
    enum: ServerTag,
    required: false,
    nullable: true,
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEnum(ServerTag, { message: 'La etiqueta debe ser un valor válido' })
  tag?: ServerTag | null;

  @ApiProperty({
    description: 'Descripción del servidor',
    example: 'Servidor de producción',
  })
  @IsString()
  @IsOptional({ message: 'La descripción es opcional' })
  @MaxLength(255, { message: 'La descripción debe tener menos de 255 caracteres' })
  description?: string;
}