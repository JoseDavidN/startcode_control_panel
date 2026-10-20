import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { HOST_KEY_FINGERPRINT } from '@monitoring/services/host-key';

export class AcceptHostKeyDto {
  @ApiPropertyOptional({
    description:
      'Huella que el usuario vio en el aviso. Si el servidor presenta ahora otra, no se acepta nada (409).',
    example: 'SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU',
  })
  @IsOptional()
  @IsString()
  @Matches(HOST_KEY_FINGERPRINT, { message: 'La huella debe tener el formato SHA256:<base64>' })
  fingerprint?: string;
}
