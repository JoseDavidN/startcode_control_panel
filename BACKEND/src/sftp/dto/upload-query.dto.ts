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

  @ApiPropertyOptional({ description: 'Tamaño declarado en bytes, solo informativo' })
  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @ApiPropertyOptional({ description: 'Sobrescribir si ya existe', default: false })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
