import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePrivateKeyDto {
  @ApiProperty({
    description: 'Nueva llave privada SSH',
    example:
      '-----BEGIN RSA PRIVATE KEY-----\nNueva llave...\n-----END RSA PRIVATE KEY-----'
  })
  @IsString()
  @IsNotEmpty({ message: 'La llave privada es requerida' })
  @MaxLength(32_768, { message: 'La llave privada es demasiado larga' })
  privateKey: string;
}
