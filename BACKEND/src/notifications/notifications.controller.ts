import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/jwt-auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '@auth/types/authenticated-request.type';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import {
  NotificationListResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar notificaciones',
    description:
      'Devuelve el historial del usuario autenticado, de la más reciente a la más antigua. Admite filtro por tipo y por no leídas.',
  })
  @ApiResponse({ status: 200, type: NotificationListResponseDto })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query() query: QueryNotificationsDto,
  ): Promise<NotificationListResponseDto> {
    return this.notificationsService.findAll(req.user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Número de notificaciones sin leer' })
  @ApiResponse({ status: 200, type: UnreadCountResponseDto })
  async unreadCount(@Request() req: AuthenticatedRequest): Promise<UnreadCountResponseDto> {
    return { unread: await this.notificationsService.unreadCount(req.user.id) };
  }

  @Patch('read')
  @ApiOperation({
    summary: 'Marcar como leídas',
    description: 'Con `all: true` marca todas; en caso contrario, las de `ids`.',
  })
  @ApiResponse({ status: 200, description: 'Número de filas marcadas' })
  async markRead(
    @Request() req: AuthenticatedRequest,
    @Body() dto: MarkReadDto,
  ): Promise<{ updated: number }> {
    const updated = dto.all
      ? await this.notificationsService.markAllRead(req.user.id)
      : await this.notificationsService.markRead(req.user.id, dto.ids ?? []);
    return { updated };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borrar una notificación' })
  @ApiParam({ name: 'id', description: 'Id de la notificación' })
  @ApiResponse({ status: 200, description: 'Notificación borrada' })
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ deleted: true }> {
    await this.notificationsService.remove(req.user.id, id);
    return { deleted: true };
  }

  @Delete()
  @ApiOperation({ summary: 'Vaciar el historial del usuario' })
  @ApiResponse({ status: 200, description: 'Número de filas borradas' })
  async clearAll(@Request() req: AuthenticatedRequest): Promise<{ deleted: number }> {
    return { deleted: await this.notificationsService.clearAll(req.user.id) };
  }
}
