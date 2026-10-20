import { IsEmail, IsJWT, IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { RawValue } from '@auth/dto/raw-value.decorator';
import { IsStrongPassword, PASSWORD_INPUT_MAX_LENGTH } from '@auth/dto/password-policy';
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
  @RawValue()
  @IsNotEmpty()
  @IsString()
  @MaxLength(PASSWORD_INPUT_MAX_LENGTH)
  currentPassword: string;

  @ApiProperty()
  @IsStrongPassword()
  newPassword: string;
}

/** Cambio de contraseña sin sesión, con el token temporal que emite el login. */
export class ChangeExpiredPasswordDto extends ChangePasswordDto {
  @ApiProperty({ description: 'Token temporal devuelto por el login' })
  @RawValue()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @IsJWT()
  tempToken: string;
}
