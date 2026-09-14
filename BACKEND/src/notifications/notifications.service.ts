import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { User } from '@auth/entities/user.entity';
import { Server } from '@servers/entities/server.entity';
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
} from '@auth/types/user-preferences.type';
import {
  Notification,
  NotificationSeverity,
  NotificationType,
} from './entities/notification.entity';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import {
  NotificationListResponseDto,
  NotificationResponseDto,
} from './dto/notification-response.dto';

interface CreatePayload {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  serverId?: string | null;
  metadata?: Notification['metadata'];
}

/** Métricas que evalúa el gateway en cada payload del agente. */
interface MetricSample {
  cpu?: number;
  memory?: number;
  disk?: number;
}

type MetricKind = 'cpu' | 'memory' | 'disk';

const METRIC_RULES: Record<
  MetricKind,
  {
    type: NotificationType;
    prefKey: 'highCpuUsage' | 'highMemoryUsage' | 'highDiskUsage';
    thresholdKey: 'cpuThreshold' | 'memoryThreshold' | 'diskThreshold';
    label: string;
  }
> = {
  cpu: {
    type: NotificationType.CPU_HIGH,
    prefKey: 'highCpuUsage',
    thresholdKey: 'cpuThreshold',
    label: 'CPU',
  },
  memory: {
    type: NotificationType.MEMORY_HIGH,
    prefKey: 'highMemoryUsage',
    thresholdKey: 'memoryThreshold',
    label: 'Memoria',
  },
  disk: {
    type: NotificationType.DISK_HIGH,
    prefKey: 'highDiskUsage',
    thresholdKey: 'diskThreshold',
    label: 'Disco',
  },
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /** Retención: acordada con el usuario. */
  private readonly MAX_PER_USER = 200;
  private readonly MAX_AGE_DAYS = 30;

  /** Puntos por debajo del umbral que hay que bajar para volver a alertar. */
  private readonly REARM_MARGIN = 5;

  /** `${serverId}:${metric}` → si la métrica está actualmente por encima del umbral. */
  private readonly aboveThreshold = new Map<string, boolean>();

  /**
   * Avisa a los clientes de que su lista cambió. Lo registra AgentGateway al
   * arrancar: así el service no depende del gateway y no hay ciclo de módulos.
   */
  private broadcast: ((userId: string) => void) | null = null;

  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  setBroadcaster(fn: (userId: string) => void): void {
    this.broadcast = fn;
  }

  /* ── Escritura ──────────────────────────────────────────────────── */

  async create(userId: string, payload: CreatePayload): Promise<Notification> {
    const saved = await this.repo.save(
      this.repo.create({
        userId,
        serverId: payload.serverId ?? null,
        type: payload.type,
        severity: payload.severity,
        title: payload.title,
        body: payload.body,
        metadata: payload.metadata ?? null,
      }),
    );

    await this.trim(userId);
    /* Solo al dueño: la señal viaja por la room del usuario, no en difusión. */
    this.broadcast?.(userId);
    return saved;
  }

  /** Poda por antigüedad y por número de filas. */
  private async trim(userId: string): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.MAX_AGE_DAYS);
    await this.repo.delete({ userId, createdAt: LessThan(cutoff) });

    const total = await this.repo.count({ where: { userId } });
    if (total <= this.MAX_PER_USER) return;

    const stale = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: this.MAX_PER_USER,
      select: ['id'],
    });
    if (stale.length) {
      await this.repo.delete({ id: In(stale.map((n) => n.id)) });
    }
  }

  /* ── Productores ────────────────────────────────────────────────── */

  /**
   * Evalúa las métricas de un servidor contra los umbrales de su dueño.
   * Notifica solo en el cruce del umbral y se rearma cuando el valor baja,
   * para no repetir la alerta mientras la métrica sigue alta.
   */
  async evaluateMetrics(server: Server, metrics: MetricSample): Promise<void> {
    const prefs = await this.preferencesOf(server.ownerId);
    if (!prefs) return;

    for (const kind of Object.keys(METRIC_RULES) as MetricKind[]) {
      const value = metrics[kind];
      if (typeof value !== 'number' || Number.isNaN(value)) continue;

      const rule = METRIC_RULES[kind];
      const threshold = prefs.monitoring[rule.thresholdKey];
      const key = `${server.id}:${kind}`;
      const wasAbove = this.aboveThreshold.get(key) ?? false;

      if (value >= threshold) {
        this.aboveThreshold.set(key, true);
        if (wasAbove || !prefs.notifications[rule.prefKey]) continue;

        await this.create(server.ownerId, {
          type: rule.type,
          severity: NotificationSeverity.WARNING,
          title: `${rule.label} alta en ${server.name}`,
          body: `El uso de ${rule.label.toLowerCase()} alcanzó el ${Math.round(value)}% (umbral ${threshold}%).`,
          serverId: server.id,
          metadata: { serverName: server.name, value: Math.round(value), threshold },
        });
      } else if (value < threshold - this.REARM_MARGIN) {
        this.aboveThreshold.set(key, false);
      }
    }
  }

  /** El servidor dejó de responder (disconnect del socket o cron de inactividad). */
  async serverWentOffline(server: Server, reason = 'El servidor dejó de responder al agente.'): Promise<void> {
    const prefs = await this.preferencesOf(server.ownerId);
    if (!prefs?.notifications.serverOffline) return;

    for (const kind of Object.keys(METRIC_RULES) as MetricKind[]) {
      this.aboveThreshold.delete(`${server.id}:${kind}`);
    }

    await this.create(server.ownerId, {
      type: NotificationType.SERVER_OFFLINE,
      severity: NotificationSeverity.ERROR,
      title: `${server.name} desconectado`,
      body: reason,
      serverId: server.id,
      metadata: { serverName: server.name },
    });
  }

  /** El agente volvió a conectar. Comparte la preferencia de `serverOffline`. */
  async serverCameBack(server: Server): Promise<void> {
    const prefs = await this.preferencesOf(server.ownerId);
    if (!prefs?.notifications.serverOffline) return;

    await this.create(server.ownerId, {
      type: NotificationType.SERVER_ONLINE,
      severity: NotificationSeverity.INFO,
      title: `${server.name} volvió a estar en línea`,
      body: 'El agente de monitoreo reanudó el envío de métricas.',
      serverId: server.id,
      metadata: { serverName: server.name },
    });
  }

  private async preferencesOf(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'preferences'],
    });
    if (!user) {
      this.logger.warn(`Sin usuario ${userId}: se omite la notificación`);
      return null;
    }
    return mergePreferences(user.preferences ?? DEFAULT_PREFERENCES, {});
  }

  /* ── Lectura ────────────────────────────────────────────────────── */

  async findAll(
    userId: string,
    query: QueryNotificationsDto,
  ): Promise<NotificationListResponseDto> {
    const where: Record<string, unknown> = { userId };
    if (query.type) where.type = query.type;
    if (query.unread) where.read = false;

    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
    });

    return {
      items: rows.map((n) => this.toResponseDto(n)),
      total,
      unread: await this.unreadCount(userId),
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, read: false } });
  }

  /* ── Marcado y borrado ──────────────────────────────────────────── */

  async markRead(userId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const res = await this.repo.update(
      { userId, id: In(ids), read: false },
      { read: true, readAt: new Date() },
    );
    return res.affected ?? 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const res = await this.repo.update(
      { userId, read: false },
      { read: true, readAt: new Date() },
    );
    return res.affected ?? 0;
  }

  async remove(userId: string, id: string): Promise<void> {
    const res = await this.repo.delete({ id, userId });
    if (!res.affected) throw new NotFoundException('Notificación no encontrada');
  }

  async clearAll(userId: string): Promise<number> {
    const res = await this.repo.delete({ userId });
    return res.affected ?? 0;
  }

  private toResponseDto(n: Notification): NotificationResponseDto {
    return {
      id: n.id,
      type: n.type,
      severity: n.severity,
      title: n.title,
      body: n.body,
      serverId: n.serverId,
      metadata: n.metadata,
      read: n.read,
      readAt: n.readAt,
      createdAt: n.createdAt,
    };
  }
}
