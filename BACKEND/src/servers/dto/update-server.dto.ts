import { PartialType, OmitType, ApiProperty } from '@nestjs/swagger';
import { CreateServerDto } from './create-server.dto';
import { IsString, IsOptional, IsEnum, IsInt, Max, Min, MaxLength, MinLength, Matches } from 'class-validator';
import { IsHost, SSH_USERNAME } from '@/common/security/network';
import { ServerStatus, ServerOs} from '../entities/server.entity';

export class UpdateServerDto extends PartialType(
  OmitType(CreateServerDto, ['privateKey', 'hostKeyFingerprint', 'hostKeyAlgorithm'] as const),
) {
  @ApiProperty({
    example: 'Servidor Producción v2',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    example: '192.168.1.101',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(253)
  @IsHost()
  host?: string;

  @ApiProperty({
    example: 2222,
    required: false,
  })
  @IsInt()
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
  @MaxLength(64)
  @Matches(SSH_USERNAME, { message: 'El usuario no puede empezar por guion ni llevar espacios, «:» ni caracteres de control' })
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
  @MaxLength(255)
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