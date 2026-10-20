import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { RawValue } from '@auth/dto/raw-value.decorator';
import { PASSWORD_INPUT_MAX_LENGTH } from '@auth/dto/password-policy';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'El correo electronico del usuario', example: 'usuario@example.com' })
  @RawValue()
  @IsString({ message: 'El email no es valido' })
  @MaxLength(254, { message: 'El email no es valido' })
  @IsEmail({}, { message: 'El email no es valido' })
  email: string;

  @ApiProperty({ description: 'La contraseña del usuario', example: 'Pasword1234!' })
  @RawValue()
  @IsString({ message: 'La contraseña debe ser texto' })
  @Length(1, PASSWORD_INPUT_MAX_LENGTH, { message: 'La contraseña no es valida' })
  password: string;

  @ApiProperty({
    description: 'Mantener la sesión iniciada: refresh de larga duración y sin cierre por inactividad',
    required: false,
    example: true,
  })
  @IsOptional()
  @RawValue()
  @IsBoolean()
  rememberMe?: boolean;

  @ApiProperty({
    description: 'Token de dispositivo de confianza emitido tras un 2FA correcto; mientras sea válido (7 días) no se pide el código',
    required: false,
  })
  @IsOptional()
  @RawValue()
  @IsString()
  @MaxLength(2048)
  trustedDeviceToken?: string;
}