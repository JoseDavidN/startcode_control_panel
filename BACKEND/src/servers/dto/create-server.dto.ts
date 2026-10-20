import { IsString, IsInt, IsEnum, IsOptional, ValidateIf, IsNotEmpty, MinLength, MaxLength, Min, Max, Matches } from 'class-validator';
import { IsHost, SSH_USERNAME } from '@/common/security/network';
import { ApiProperty } from '@nestjs/swagger';
import { HOST_KEY_FINGERPRINT } from '@monitoring/services/host-key';
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
  @MaxLength(253)
  @IsHost()
  host: string;

  @ApiProperty({ description: 'Puerto del servidor', example: 22, default: 22 })
  @IsInt({ message: 'El puerto debe ser un número entero' })
  @Min(1, { message: 'El puerto debe ser mayor a 0' })
  @Max(65535, { message: 'El puerto debe ser menor a 65535' })
  @IsOptional({ message: 'El puerto es opcional' })
  port?: number;

  @ApiProperty({ description: 'Usuario del servidor', example: 'root' })
  @IsString()
  @IsNotEmpty({ message: 'El usuario es requerido' })
  @MaxLength(64)
  @Matches(SSH_USERNAME, { message: 'El usuario no puede empezar por guion ni llevar espacios, «:» ni caracteres de control' })
  username: string;

  @ApiProperty({
    description: 'Clave privada del servidor (Se almacena de forma segura)',
    example:
      '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----'
  })
  @IsString()
  @IsNotEmpty({ message: 'La clave privada es requerida' })
  @MaxLength(32_768, { message: 'La clave privada es demasiado larga' })
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

  @ApiProperty({
    description: 'Huella SHA256 de la clave de host vista al probar la conexión; se fija al crear',
    example: 'SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(HOST_KEY_FINGERPRINT, { message: 'La huella debe tener el formato SHA256:<base64>' })
  hostKeyFingerprint?: string;

  @ApiProperty({ description: 'Algoritmo de esa clave de host', example: 'ssh-ed25519', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9@.-]{2,63}$/, { message: 'Algoritmo de clave de host no válido' })
  hostKeyAlgorithm?: string;
}