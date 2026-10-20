import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServerStatus, ServerOs, ServerTag, type Server } from '../entities/server.entity';

/** El mismo jsonb que la entidad: sin `any`, para que el compilador avise. */
export type ServerMetadata = Server['metadata'];
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ServerResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose({ name: 'name' })
  @ApiProperty()
  name: string;

  @Expose({ name: 'host' })
  @ApiProperty()
  host: string;

  @Expose({ name: 'port' })
  @ApiProperty()
  port: number;

  @Expose({ name: 'username' })
  @ApiProperty()
  username: string;

  @Expose({ name: 'status' })
  @ApiProperty({ enum: ServerStatus })
  status: ServerStatus;

  @Expose({ name: 'os' })
  @ApiProperty({ enum: ServerOs })
  os: ServerOs;

  @Expose({ name: 'tag' })
  @ApiPropertyOptional({ enum: ServerTag, nullable: true })
  tag: ServerTag | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, description: 'Cuándo se marcó como favorito; null si no lo es' })
  favoritedAt: Date | null;

  @Expose({ name: 'description' })
  @ApiProperty({ required: false })
  description: string;

  @Expose({ name: 'metadata' })
  @ApiProperty({ required: false })
  metadata: ServerMetadata;

  @Expose({ name: 'ownerId' })
  @ApiProperty()
  ownerId: string;

  @Expose()
  /* El DTO es @Exclude() por defecto: sin @Expose() estos campos no salen. */
  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    description: 'Última vez que el agente reportó; null si nunca lo hizo',
  })
  lastSeen: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, example: 'devstar' })
  hostname: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, example: 'Ubuntu 24.04.3 LTS' })
  osVersion: string | null;

  /* La clave de host no es secreta: el usuario la compara con `ssh-keygen -lf`. */
  @Expose()
  @ApiPropertyOptional({ nullable: true, example: 'ssh-ed25519' })
  hostKeyAlgorithm: string | null;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    example: 'SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU',
    description: 'Huella de la clave de host SSH; null hasta la primera conexión',
  })
  hostKeyFingerprint: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true, description: 'Cuándo se fijó o se aceptó la clave de host' })
  hostKeyVerifiedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;

  @Expose()
  @ApiProperty({ required: false })
  lastCheckAt: Date;
}
