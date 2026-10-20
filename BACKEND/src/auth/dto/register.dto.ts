import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RawValue } from '@auth/dto/raw-value.decorator';
import { IsStrongPassword } from '@auth/dto/password-policy';

export class RegisterDto {
  @ApiProperty({ description: 'Nombres del usuario', example: 'Juan Carlos' })
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El nombre debe tener menos de 50 caracteres' })
  firstname: string;

  @ApiProperty({
    description: 'Apellidos del usuario',
    example: 'Perez Garcia',
  })
  @IsString()
  @MinLength(3, { message: 'El apellido debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El apellido debe tener menos de 50 caracteres' })
  lastname: string;

  @ApiProperty({
    description: 'El correo electronico del usuario',
    example: 'usuario@example.com',
  })
  @RawValue()
  @IsString({ message: 'El email no es valido' })
  @MaxLength(254, { message: 'El email no es valido' })
  @IsEmail({}, { message: 'El email no es valido' })
  email: string;

  @ApiProperty({
    description: 'El rol del usuario (opcional, por defecto: user)',
    example: 'admin',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['admin', 'user'], { message: 'El rol no es valido' })
  role?: string;

  @ApiProperty({
    description: 'La contraseña del usuario',
    example: 'Pasword1234!',
  })
  @IsStrongPassword()
  password: string;
}
