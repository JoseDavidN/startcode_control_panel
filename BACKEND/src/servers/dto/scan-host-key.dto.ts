import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsHost } from '@/common/security/network';

/** Host al que se va a dar de alta un servidor: se lee su clave antes de guardarlo. */
export class ScanHostKeyDto {
  @ApiProperty({ description: 'Host del servidor', example: '192.168.1.1' })
  @IsString()
  @IsNotEmpty({ message: 'El host es requerido' })
  @MaxLength(253)
  @IsHost()
  host: string;

  @ApiProperty({ description: 'Puerto SSH', example: 22, default: 22, required: false })
  @IsOptional()
  @IsInt({ message: 'El puerto debe ser un número entero' })
  @Min(1, { message: 'El puerto debe ser mayor a 0' })
  @Max(65535, { message: 'El puerto debe ser menor a 65535' })
  port?: number;
}
