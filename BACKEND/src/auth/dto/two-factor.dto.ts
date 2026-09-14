import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

const SIX_DIGITS = /^\d{6}$/;

export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456', description: 'Código TOTP de 6 dígitos' })
  @IsString()
  @Matches(SIX_DIGITS, { message: 'El código debe ser de 6 dígitos' })
  code: string;
}

/** Desactivar el 2FA o regenerar códigos exige también la contraseña. */
export class TwoFactorCodeWithPasswordDto extends TwoFactorCodeDto {
  @ApiProperty({ description: 'Contraseña actual del usuario' })
  @IsString()
  @Length(1, 128)
  password: string;
}

export class TwoFactorVerifyLoginDto {
  @ApiProperty({ description: 'Token temporal devuelto cuando 2FA está activo' })
  @IsString()
  tempToken: string;

  @ApiPropertyOptional({ example: '123456', description: 'Código TOTP de 6 dígitos' })
  @IsOptional()
  @ValidateIf((o: TwoFactorVerifyLoginDto) => !o.backupCode)
  @IsString()
  @Matches(SIX_DIGITS, { message: 'El código debe ser de 6 dígitos' })
  code?: string;

  @ApiPropertyOptional({ example: 'A3F9-K2LM', description: 'Código de respaldo de un solo uso' })
  @IsOptional()
  @IsString()
  @Length(8, 12)
  backupCode?: string;
}

export class TwoFactorSetupResponseDto {
  @ApiProperty({ description: 'Secreto TOTP (guardar hasta confirmar)' })
  secret: string;

  @ApiProperty({ description: 'URL otpauth:// para escanear con la app' })
  otpAuthUrl: string;

  @ApiProperty({ description: 'QR code como data URL (imagen PNG en base64)' })
  qrCodeDataUrl: string;
}

export class TwoFactorEnabledResponseDto {
  @ApiProperty({ example: '2FA activado correctamente' })
  message: string;

  @ApiProperty({
    type: [String],
    description: 'Códigos de respaldo en claro. Solo se muestran esta vez.',
    example: ['A3F9-K2LM', 'P7QR-4TVW'],
  })
  backupCodes: string[];
}
