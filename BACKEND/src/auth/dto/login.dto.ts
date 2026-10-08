import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'El correo electronico del usuario', example: 'usuario@example.com' })
  @IsEmail({}, { message: 'El email no es valido' })
  email: string;

  @ApiProperty({ description: 'La contraseña del usuario', example: 'Pasword1234!' })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'Mantener la sesión iniciada: refresh de larga duración y sin cierre por inactividad',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @ApiProperty({
    description: 'Token de dispositivo de confianza emitido tras un 2FA correcto; mientras sea válido (7 días) no se pide el código',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  trustedDeviceToken?: string;
}