import { ApiProperty } from '@nestjs/swagger';
import { ServerStatus, ServerOs } from '../entities/server.entity';
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

  @Expose({ name: 'description' })
  @ApiProperty({ required: false })
  description: string;

  @Expose({ name: 'metadata' })
  @ApiProperty({ required: false })
  metadata: any;

  @Expose({ name: 'ownerId' })
  @ApiProperty()
  ownerId: string;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;

  @Expose()
  @ApiProperty({ required: false })
  lastCheckAt: Date;
}
