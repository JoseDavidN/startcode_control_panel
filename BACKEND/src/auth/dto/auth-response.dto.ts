import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';
import type { UserPreferences } from '../types/user-preferences.type';

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
  twoFactorEnabled: boolean;

  @ApiProperty()
  lastLogin: Date;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  passwordChangedAt: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ required: false, nullable: true, description: 'null = el usuario nunca guardó preferencias' })
  preferences: UserPreferences | null;
}

/** Perfil completo de /auth/me y /auth/profile — nunca incluye password ni twoFactorSecret. */
export class UserProfileDto extends UserResponseDto {
  @ApiProperty()
  firstname: string;

  @ApiProperty()
  lastname: string;
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