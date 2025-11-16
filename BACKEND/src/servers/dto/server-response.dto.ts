import { ApiProperty } from '@nestjs/swagger';
import { ServerStatus, ServerOs } from '../entities/server.entity';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ServerResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose({ name: 'str_name' })
  @ApiProperty()
  name: string;

  @Expose({ name: 'str_host' })
  @ApiProperty()
  host: string;

  @Expose({ name: 'int_port' })
  @ApiProperty()
  port: number;

  @Expose({ name: 'str_username' })
  @ApiProperty()
  username: string;

  @Expose({ name: 'enu_status' })
  @ApiProperty({ enum: ServerStatus })
  status: ServerStatus;

  @Expose({ name: 'enu_os' })
  @ApiProperty({ enum: ServerOs })
  os: ServerOs;

  @Expose({ name: 'str_description' })
  @ApiProperty({ required: false })
  description: string;

  @Expose({ name: 'json_metadata' })
  @ApiProperty({ required: false })
  metadata: any;

  @Expose({ name: 'str_owner_id' })
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
