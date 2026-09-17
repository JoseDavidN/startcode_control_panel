// src/servers/dto/agent-install.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class InstallAgentDto {
  @ApiPropertyOptional({
    description:
      'Contraseña de sudo del usuario SSH. Solo hace falta si no es root ni tiene sudo sin contraseña. No se guarda en ninguna parte.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sudoPassword?: string;

  @ApiPropertyOptional({
    description:
      'URL pública del panel para este servidor, si la de la configuración no le sirve.',
    example: 'http://192.168.1.50:3001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  panelUrl?: string;

  @ApiPropertyOptional({ description: 'Reinstalar aunque ya estuviera instalado' })
  @IsOptional()
  @IsBoolean()
  reinstall?: boolean;
}

export class UninstallAgentDto {
  @ApiPropertyOptional({ description: 'Contraseña de sudo, si hace falta' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sudoPassword?: string;

  @ApiPropertyOptional({ description: 'Borrar también /etc/startcode-agent' })
  @IsOptional()
  @IsBoolean()
  purge?: boolean;
}

export class DeleteServerDto {
  @ApiPropertyOptional({ description: 'Contraseña de sudo para desinstalar el agente' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sudoPassword?: string;

  @ApiPropertyOptional({
    description:
      'Eliminar el servidor aunque el agente no se pueda desinstalar. El agente quedaría huérfano en la máquina.',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
