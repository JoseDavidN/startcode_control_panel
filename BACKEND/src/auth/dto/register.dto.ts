import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(50, { message: 'La contraseña debe tener menos de 50 caracteres' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'La contraseña debe tener al menos una letra mayuscula, una minuscula, un numero y un caracter especial',
    },
  )
  password: string;
}
