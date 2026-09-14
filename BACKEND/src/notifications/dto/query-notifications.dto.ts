import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

const TYPES = Object.values(NotificationType);

export class QueryNotificationsDto {
  @ApiPropertyOptional({ enum: TYPES, description: 'Filtrar por tipo' })
  @IsOptional()
  @IsIn(TYPES)
  type?: NotificationType;

  @ApiPropertyOptional({ description: 'Solo no leídas', example: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
