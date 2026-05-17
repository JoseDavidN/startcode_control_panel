import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class AuthResponseDto {
  @ApiProperty()
  user: UserResponseDto;

  @ApiProperty()
  token: string;

  @ApiProperty({ required: false })
  refreshToken?: string;

  @ApiProperty()
  expiresIn: string;
}

export class TwoFactorPendingDto {
  @ApiProperty({ example: true })
  requiresTwoFactor: boolean;

  @ApiProperty({ description: 'Token temporal válido por 5 minutos' })
  tempToken: string;
}