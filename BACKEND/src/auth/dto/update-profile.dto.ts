import { IsEmail, IsOptional, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  email?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
  newPassword: string;
}

/** Cambio de contraseña sin sesión, con el token temporal que emite el login. */
export class ChangeExpiredPasswordDto extends ChangePasswordDto {
  @ApiProperty({ description: 'Token temporal devuelto por el login' })
  @IsString()
  @IsNotEmpty()
  tempToken: string;
}
