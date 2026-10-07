import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ServiceAction {
  START = 'start',
  STOP = 'stop',
  RESTART = 'restart',
  ENABLE = 'enable',
  DISABLE = 'disable',
}

export class ServiceActionDto {
  @ApiProperty({ enum: ServiceAction, description: 'Acción a ejecutar en el servicio' })
  @IsEnum(ServiceAction)
  action: ServiceAction;

  @ApiPropertyOptional({
    description:
      'Contraseña de sudo del usuario SSH. Solo hace falta si no es root ni tiene sudo sin contraseña. No se guarda en ninguna parte.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sudoPassword?: string;
}

export class ServiceLogsDto {
  @ApiPropertyOptional({ description: 'Número de líneas a devolver', default: 100 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  lines?: number;

  @ApiPropertyOptional({ description: 'Contraseña de sudo, si el journal la exige' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sudoPassword?: string;
}

export class ExecCommandDto {
  @ApiProperty({ description: 'Comando a ejecutar (sin TTY, máximo 60 s)', example: 'df -h' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  command: string;

  @ApiPropertyOptional({ description: 'Directorio de trabajo; por defecto el home del usuario SSH', example: '/var/www' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cwd?: string;

  @ApiPropertyOptional({ description: 'Ejecutar con sudo' })
  @IsOptional()
  @IsBoolean()
  sudo?: boolean;

  @ApiPropertyOptional({ description: 'Contraseña de sudo. No se guarda en ninguna parte.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sudoPassword?: string;

  @ApiPropertyOptional({ description: 'Confirma un comando marcado como peligroso (DANGEROUS_COMMAND)' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class KillProcessDto {
  @ApiPropertyOptional({
    description: 'Contraseña de sudo, si el proceso es de otro usuario. No se guarda en ninguna parte.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sudoPassword?: string;
}

export class DockerContainersDto {
  @ApiPropertyOptional({
    description: 'Contraseña de sudo, si el usuario SSH no puede usar docker. No se guarda en ninguna parte.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sudoPassword?: string;
}

export class PinnedServicesDto {
  @ApiProperty({
    description:
      'Unidades systemd que el usuario quiere ver primero en este servidor. Reemplaza la lista entera.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  services: string[];
}
