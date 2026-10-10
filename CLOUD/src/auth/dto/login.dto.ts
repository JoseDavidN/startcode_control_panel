import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password: string;

  /** Nombre del equipo que se conecta, para reconocer la sesión. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}
