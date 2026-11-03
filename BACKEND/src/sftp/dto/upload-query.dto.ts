// src/sftp/dto/upload-query.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UploadQueryDto {
  @ApiProperty({
    description: 'Directorio remoto de destino, absoluto',
    example: '/var/www/html',
  })
  @IsString()
  @MaxLength(4096)
  destDir: string;

  @ApiProperty({
    description:
      'Ruta del archivo relativa al destino. Es la que conserva el árbol al subir una carpeta',
    example: 'assets/img/logo.svg',
  })
  @IsString()
  @MaxLength(4096)
  relPath: string;

  @ApiPropertyOptional({ description: 'Bytes de este envío (la parte, en una subida por partes)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @ApiPropertyOptional({
    description: 'Posición de esta parte dentro del archivo. Mayor que 0 continúa una subida empezada en la misma sesión',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ description: 'Tamaño total del archivo, en una subida por partes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  total?: number;

  @ApiPropertyOptional({ description: 'Sobrescribir si ya existe', default: false })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
