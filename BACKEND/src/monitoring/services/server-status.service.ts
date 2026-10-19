// src/monitoring/services/server-status.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Server, ServerStatus } from '@servers/entities/server.entity';
import { NotificationsService } from '@/notifications/notifications.service';

/** Emite un evento a la room del dueño del servidor. */
export type ServerStatusBroadcaster = (
  ownerId: string,
  event: string,
  payload?: unknown,
) => void;

/**
 * Servicio para verificar y actualizar el estado de los servidores
 * basado en la última vez que enviaron métricas
 */
@Injectable()
export class ServerStatusService {
  private readonly logger = new Logger(ServerStatusService.name);

  /* Tiempo en minutos sin actividad para considerar un servidor como offline.
     El frontend usa el mismo umbral para marcar unas métricas como viejas
     (STALE_METRICS_MS en lib/serverRuntime.ts): si cambia uno, cambia el otro. */
  private readonly OFFLINE_THRESHOLD_MINUTES = 5;

  /* Lo registra AgentGateway al arrancar. Así este servicio avisa al panel sin
     depender del gateway, que es quien depende de él (igual que hace
     NotificationsService). Sin esto, un servidor que muere por inactividad se
     queda "online" en la lista hasta que alguien recarga la página. */
  private broadcast: ServerStatusBroadcaster | null = null;

  setBroadcaster(fn: ServerStatusBroadcaster): void {
    this.broadcast = fn;
  }

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
            `🔴 Servidor marcado como OFFLINE por inactividad: ${server.name} (última actividad: ${String(server.lastSeen)})`,
          );

          /* Se reutiliza el evento que el panel ya escucha, en vez de inventar
             uno nuevo: cero cambios en el cliente. */
          this.broadcast?.(server.ownerId, 'agent:disconnected', {
            serverId: server.id,
            reason: 'inactivity',
          });

          await this.notificationsService
            .serverWentOffline(
              server,
              `Sin métricas desde hace más de ${this.OFFLINE_THRESHOLD_MINUTES} minutos.`,
            )
            .catch((err) =>
              this.logger.error(
                `Error notificando inactividad de ${server.name}: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
        }
      } else {
        this.logger.debug('✅ Todos los servidores tienen estado correcto');
      }
    } catch (error) {
      this.logger.error(
        `❌ Error verificando estado de servidores: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
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

    /* Hace falta el dueño para avisar solo a quien corresponde. */
    const server = await this.serversRepository.findOne({
      where: { id: serverId },
      select: ['id', 'ownerId'],
    });
    if (server) {
      this.broadcast?.(server.ownerId, 'agent:disconnected', {
        serverId: server.id,
        reason: reason ?? 'manual',
      });
    }
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
