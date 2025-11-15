import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'El correo electronico del usuario', example: 'usuario@example.com' })
  @IsEmail({}, { message: 'El email no es valido' })
  email: string;

  @ApiProperty({ description: 'La contraseña del usuario', example: 'Pasword1234!' })
  @IsString()
  password: string;
}