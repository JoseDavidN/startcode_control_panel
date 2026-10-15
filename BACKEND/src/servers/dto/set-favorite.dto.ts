import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetFavoriteDto {
  @ApiProperty({ description: 'true marca el servidor como favorito; false lo quita', example: true })
  @IsBoolean({ message: 'favorite debe ser true o false' })
  favorite: boolean;
}
