import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { SECTIONS, type Section } from '@/common/sections';

/* Las rutas son relativas a la raíz de la sección (`Documentos/Contratos`);
   path-guard las valida segmento a segmento. */

export class SectionPathQuery {
  @IsIn(SECTIONS)
  section: Section;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  path?: string;
}

/** Lo que el webview reproduce por sí mismo (`canPlayType`), además de H.264 y AAC. */
export class ClientCapsDto {
  @IsOptional() @IsBoolean() hevc?: boolean;
  @IsOptional() @IsBoolean() vp9?: boolean;
  @IsOptional() @IsBoolean() av1?: boolean;
  @IsOptional() @IsBoolean() webm?: boolean;
}

export class StreamTicketDto extends SectionPathQuery {
  @IsOptional()
  @ValidateNested()
  @Type(() => ClientCapsDto)
  client?: ClientCapsDto;
}

export class CreateFolderDto {
  @IsIn(SECTIONS)
  section: Section;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  parent?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

export class UploadQuery {
  @IsIn(SECTIONS)
  section: Section;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  parent?: string;

  /** Ruta del archivo dentro de lo elegido o soltado (`fotos/2026/a.jpg`). */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  relPath: string;

  /** Tamaño declarado: si no coincide con lo recibido, la subida se descarta. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  size?: number;
}

export class RenameDto {
  @IsIn(SECTIONS)
  section: Section;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  path: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

export class MoveDto {
  @IsIn(SECTIONS)
  section: Section;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  path: string;

  @IsIn(SECTIONS)
  toSection: Section;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  toParent?: string;
}
