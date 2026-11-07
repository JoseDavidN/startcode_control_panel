// src/sftp/dto/download-query.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class DownloadQueryDto {
  @ApiProperty({
    description: 'Archivo o carpeta del servidor, ruta absoluta',
    example: '/var/www/html',
  })
  @IsString()
  @MaxLength(4096)
  path: string;
}
