// src/monitoring/services/server-status.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Server, ServerStatus } from '@servers/entities/server.entity';
import { NotificationsService } from '@/notifications/notifications.service';

/**
 * Servicio para verificar y actualizar el estado de los servidores
 * basado en la última vez que enviaron métricas
 */
@Injectable()
export class ServerStatusService {
  private readonly logger = new Logger(ServerStatusService.name);

  // Tiempo en minutos sin actividad para considerar un servidor como offline
  private readonly OFFLINE_THRESHOLD_MINUTES = 5;

  constructor(
    @InjectRepository(Server)
    private serversRepository: Repository<Server>,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Verifica periódicamente el estado de los servidores
   * Se ejecuta cada 2 minutos
   */
  @Cron('0 */2 * * * *') // Cada 2 minutos
  async checkServerStatus(): Promise<void> {
    this.logger.debug('⏰ Verificando estado de servidores...');

    try {
      // Calcular el tiempo límite (ahora - umbral)
      const thresholdTime = new Date();
      thresholdTime.setMinutes(
        thresholdTime.getMinutes() - this.OFFLINE_THRESHOLD_MINUTES,
      );

      // Buscar servidores que:
      // 1. Están marcados como ONLINE
      // 2. No han enviado datos en los últimos N minutos
      const staleServers = await this.serversRepository.find({
        where: [
          {
            status: ServerStatus.ONLINE,
            lastSeen: LessThan(thresholdTime),
          },
        ],
      });

      if (staleServers.length > 0) {
        this.logger.warn(
          `⚠️  Encontrados ${staleServers.length} servidores sin actividad reciente`,
        );

        // Actualizar estado a OFFLINE
        for (const server of staleServers) {
          await this.serversRepository.update(server.id, {
            status: ServerStatus.OFFLINE,
          });

          this.logger.log(
            `🔴 Servidor marcado como OFFLINE por inactividad: ${server.name} (última actividad: ${server.lastSeen})`,
          );

          await this.notificationsService
            .serverWentOffline(
              server,
              `Sin métricas desde hace más de ${this.OFFLINE_THRESHOLD_MINUTES} minutos.`,
            )
            .catch((err) =>
              this.logger.error(
                `Error notificando inactividad de ${server.name}: ${err.message}`,
              ),
            );
        }
      } else {
        this.logger.debug('✅ Todos los servidores tienen estado correcto');
      }
    } catch (error) {
      this.logger.error(
        `❌ Error verificando estado de servidores: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Obtiene servidores que no han enviado métricas recientemente
   * Útil para debugging o reportes
   */
  async getInactiveServers(
    thresholdMinutes: number = this.OFFLINE_THRESHOLD_MINUTES,
  ): Promise<Server[]> {
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - thresholdMinutes);

    return this.serversRepository.find({
      where: {
        lastSeen: LessThan(thresholdTime),
      },
      order: { lastSeen: 'ASC' },
    });
  }

  /**
   * Marca manualmente un servidor como offline
   * Útil para mantenimiento programado
   */
  async markServerOffline(serverId: string, reason?: string): Promise<void> {
    await this.serversRepository.update(serverId, {
      status: ServerStatus.OFFLINE,
    });

    this.logger.log(
      `🔴 Servidor marcado manualmente como OFFLINE: ${serverId}${reason ? ` (Razón: ${reason})` : ''}`,
    );
  }

  /**
   * Obtiene estadísticas de estado de servidores
   */
  async getStatusStats(): Promise<{
    online: number;
    offline: number;
    total: number;
    lastCheck: Date;
  }> {
    const [online, offline, total] = await Promise.all([
      this.serversRepository.count({
        where: { status: ServerStatus.ONLINE },
      }),
      this.serversRepository.count({
        where: { status: ServerStatus.OFFLINE },
      }),
      this.serversRepository.count(),
    ]);

    return {
      online,
      offline,
      total,
      lastCheck: new Date(),
    };
  }
}
