import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456', description: 'Código TOTP de 6 dígitos' })
  @IsString()
  @Length(6, 6, { message: 'El código debe tener exactamente 6 dígitos' })
  code: string;
}

export class TwoFactorVerifyLoginDto {
  @ApiProperty({ description: 'Token temporal devuelto cuando 2FA está activo' })
  @IsString()
  tempToken: string;

  @ApiProperty({ example: '123456', description: 'Código TOTP de 6 dígitos' })
  @IsString()
  @Length(6, 6, { message: 'El código debe tener exactamente 6 dígitos' })
  code: string;
}

export class TwoFactorSetupResponseDto {
  @ApiProperty({ description: 'Secreto TOTP (guardar hasta confirmar)' })
  secret: string;

  @ApiProperty({ description: 'URL otpauth:// para escanear con la app' })
  otpAuthUrl: string;

  @ApiProperty({ description: 'QR code como data URL (imagen PNG en base64)' })
  qrCodeDataUrl: string;
}
