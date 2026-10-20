import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsString, MaxLength } from 'class-validator';
import { RawValue } from '@auth/dto/raw-value.decorator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Token de actualización emitido por el login' })
  @RawValue()
  @IsString()
  @MaxLength(2048)
  @IsJWT()
  refreshToken: string;
}
