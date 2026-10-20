import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  DatabaseEngine,
  DatabaseSshAuth,
  DatabaseSshMode,
  DatabaseTag,
} from '../entities/database-connection.entity';
import { IsHost, SSH_USERNAME } from '@/common/security/network';
import { HOST_KEY_FINGERPRINT } from '@monitoring/services/host-key';

/* Sin bytes nulos ni caracteres de control: los drivers cortan o malinterpretan el valor. */
// eslint-disable-next-line no-control-regex
const NO_CONTROL = /^[^\x00-\x1f\x7f]*$/;

const isCustomTunnel = (o: { sshMode?: DatabaseSshMode }) => o.sshMode === DatabaseSshMode.CUSTOM;

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

  /* ── Túnel SSH ──────────────────────────────────────────────── */

  @ApiPropertyOptional({ enum: DatabaseSshMode, default: DatabaseSshMode.NONE })
  @IsOptional()
  @IsEnum(DatabaseSshMode, { message: 'Modo de túnel SSH no válido' })
  sshMode?: DatabaseSshMode;

  @ApiPropertyOptional({ description: 'Servidor del panel por el que pasa el túnel (modo `server`)' })
  @ValidateIf((o: CreateDatabaseConnectionDto) => o.sshMode === DatabaseSshMode.SERVER)
  @IsUUID('all', { message: 'Elige el servidor SSH del túnel' })
  sshServerId?: string;

  @ApiPropertyOptional({ example: 'bastion.example.com', description: 'Modo `custom`' })
  @ValidateIf(isCustomTunnel)
  @IsString()
  @IsNotEmpty({ message: 'El host SSH es requerido' })
  @MaxLength(253)
  @IsHost({ message: 'El host SSH debe ser una IP o un nombre de dominio válido' })
  sshHost?: string;

  @ApiPropertyOptional({ example: 22 })
  @ValidateIf(isCustomTunnel)
  @IsInt()
  @Min(1, { message: 'El puerto SSH debe ser mayor a 0' })
  @Max(65535, { message: 'El puerto SSH debe ser menor a 65535' })
  sshPort?: number;

  @ApiPropertyOptional({ example: 'deploy' })
  @ValidateIf(isCustomTunnel)
  @IsString()
  @Matches(SSH_USERNAME, { message: 'El usuario SSH no es válido' })
  sshUsername?: string;

  @ApiPropertyOptional({ enum: DatabaseSshAuth })
  @ValidateIf(isCustomTunnel)
  @IsEnum(DatabaseSshAuth, { message: 'Elige contraseña o llave privada para el túnel SSH' })
  sshAuth?: DatabaseSshAuth;

  @ApiPropertyOptional({
    description: 'Contraseña o llave privada SSH; se guarda cifrada. En una edición, omitida conserva la actual.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16_384)
  sshSecret?: string;

  @ApiPropertyOptional({ example: 'SHA256:…', description: 'Huella confirmada por el usuario (modo `custom`)' })
  @ValidateIf(isCustomTunnel)
  @IsString()
  @Matches(HOST_KEY_FINGERPRINT, { message: 'Confirma la huella del servidor SSH' })
  sshHostKeyFingerprint?: string;

  @ApiPropertyOptional({ example: 'ssh-ed25519' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sshHostKeyAlgorithm?: string;
}
