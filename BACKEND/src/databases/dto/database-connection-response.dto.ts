import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DatabaseConnectionStatus,
  DatabaseEngine,
  DatabaseSshAuth,
  DatabaseSshMode,
  DatabaseTag,
} from '../entities/database-connection.entity';

/** Una conexión tal como la ve la app: nunca lleva la contraseña. */
export class DatabaseConnectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'StartCode producción' })
  name: string;

  @ApiProperty({ enum: DatabaseEngine })
  engine: DatabaseEngine;

  @ApiProperty({ example: '10.0.0.12' })
  host: string;

  @ApiProperty({ example: 5432 })
  port: number;

  @ApiProperty({ example: 'startcode' })
  username: string;

  @ApiPropertyOptional({ example: 'db_startcode', nullable: true })
  database: string | null;

  @ApiPropertyOptional({ enum: DatabaseTag, nullable: true })
  tag: DatabaseTag | null;

  @ApiProperty({ description: 'Si hay una contraseña guardada' })
  hasPassword: boolean;

  @ApiProperty({ enum: DatabaseSshMode })
  sshMode: DatabaseSshMode;

  @ApiPropertyOptional({ nullable: true })
  sshServerId: string | null;

  @ApiPropertyOptional({ nullable: true })
  sshHost: string | null;

  @ApiPropertyOptional({ nullable: true })
  sshPort: number | null;

  @ApiPropertyOptional({ nullable: true })
  sshUsername: string | null;

  @ApiPropertyOptional({ enum: DatabaseSshAuth, nullable: true })
  sshAuth: DatabaseSshAuth | null;

  @ApiProperty({ description: 'Si hay una contraseña o llave SSH guardada' })
  hasSshSecret: boolean;

  @ApiPropertyOptional({ nullable: true })
  sshHostKeyFingerprint: string | null;

  @ApiPropertyOptional({ nullable: true })
  sshHostKeyAlgorithm: string | null;

  @ApiProperty({ enum: DatabaseConnectionStatus })
  status: DatabaseConnectionStatus;

  @ApiPropertyOptional({ example: '16.4', nullable: true })
  version: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastError: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastCheckedAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class DatabaseConnectionTestResponseDto {
  @ApiProperty()
  ok: boolean;

  @ApiPropertyOptional({ example: '16.4', nullable: true })
  version: string | null;

  @ApiPropertyOptional({ example: 'Usuario o contraseña incorrectos', nullable: true })
  error: string | null;

  @ApiProperty({ example: 23 })
  latencyMs: number;
}

export class DatabaseConnectionPasswordResponseDto {
  @ApiProperty({ description: 'Contraseña en claro; vacía si no hay ninguna guardada' })
  password: string;
}
