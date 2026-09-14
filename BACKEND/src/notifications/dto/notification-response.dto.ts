import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationSeverity,
  NotificationType,
} from '../entities/notification.entity';

export class NotificationResponseDto {
  @ApiProperty({ example: '9f1c8f3e-1f2a-4c1b-9a1e-2b3c4d5e6f70' })
  id: string;

  @ApiProperty({ enum: NotificationType, example: NotificationType.CPU_HIGH })
  type: NotificationType;

  @ApiProperty({ enum: NotificationSeverity, example: NotificationSeverity.WARNING })
  severity: NotificationSeverity;

  @ApiProperty({ example: 'CPU alta en prod-server-01' })
  title: string;

  @ApiProperty({ example: 'El uso de CPU alcanzó el 92% (umbral 80%).' })
  body: string;

  @ApiPropertyOptional({ example: '2f8b2e10-0c2a-4f9e-8b7a-9d1e2f3a4b5c', nullable: true })
  serverId: string | null;

  @ApiPropertyOptional({
    example: { serverName: 'prod-server-01', value: 92, threshold: 80 },
    nullable: true,
  })
  metadata: { serverName?: string; value?: number; threshold?: number } | null;

  @ApiProperty({ example: false })
  read: boolean;

  @ApiPropertyOptional({ nullable: true })
  readAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items: NotificationResponseDto[];

  @ApiProperty({ description: 'Total de filas que cumplen el filtro', example: 42 })
  total: number;

  @ApiProperty({ description: 'No leídas del usuario, sin aplicar filtros', example: 7 })
  unread: number;
}

export class UnreadCountResponseDto {
  @ApiProperty({ example: 7 })
  unread: number;
}
