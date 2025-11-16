import { PartialType, OmitType, ApiProperty } from '@nestjs/swagger';
import { CreateServerDto } from './create-server.dto';
import { IsString, IsOptional, IsEnum, IsNumber, Max, Min} from 'class-validator';
import { ServerStatus, ServerOs} from '../entities/server.entity';

export class UpdateServerDto extends PartialType(
  OmitType(CreateServerDto, ['privateKey'] as const),
) {
  @ApiProperty({
    example: 'Servidor Producción v2',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: '192.168.1.101',
    required: false,
  })
  @IsString()
  @IsOptional()
  host?: string;

  @ApiProperty({
    example: 2222,
    required: false,
  })
  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  @ApiProperty({
    example: 'admin',
    required: false,
  })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty({
    enum: ServerOs,
    required: false,
  })
  @IsEnum(ServerOs)
  @IsOptional()
  os?: ServerOs;

  @ApiProperty({
    example: 'Descripción actualizada',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    enum: ServerStatus,
    required: false,
    description: 'Estado manual del servidor',
  })
  @IsEnum(ServerStatus)
  @IsOptional()
  status?: ServerStatus;
}