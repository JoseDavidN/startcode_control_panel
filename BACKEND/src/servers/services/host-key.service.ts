import { BadGatewayException, BadRequestException, ConflictException, HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from '@servers/entities/server.entity';
import { ServersService } from '@servers/servers.service';
import { SSHService } from '@monitoring/services/ssh.service';
import type { HostKey } from '@monitoring/services/host-key';
import { NotificationsService } from '@/notifications/notifications.service';
import { NotificationSeverity, NotificationType } from '@/notifications/entities/notification.entity';
import type { User } from '@auth/entities/user.entity';

export interface AcceptHostKeyResult {
  serverId: string;
  previous: { algorithm: string | null; fingerprint: string | null };
  hostKeyAlgorithm: string;
  hostKeyFingerprint: string;
  hostKeyVerifiedAt: Date;
}

/**
 * Confirmación de la clave de host por el usuario: al dar de alta el servidor
 * (`scan`, antes de guardarlo), en su primera conexión o cuando cambia
 * (reinstalación, claves regeneradas…). El panel nunca la acepta solo.
 */
@Injectable()
export class HostKeyService {
  private readonly logger = new Logger(HostKeyService.name);

  constructor(
    @InjectRepository(Server)
    private readonly repo: Repository<Server>,
    private readonly servers: ServersService,
    private readonly ssh: SSHService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Clave que presenta `host:port`, sin autenticarse, para enseñarla en el alta. */
  async scan(host: string, port: number): Promise<HostKey> {
    return await this.probe({ host, port, username: 'startcode' });
  }

  /** Un host que no responde es un 502 con el motivo, no un 500. */
  private async probe(target: Pick<Server, 'host' | 'port' | 'username'>): Promise<HostKey> {
    try {
      return await this.ssh.probeHostKey(target);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`No se pudo leer la clave de host de ${target.host}:${target.port}: ${reason}`);
    }
  }

  /**
   * Vuelve a leer la clave que presenta ahora el host (sin autenticarse) y la
   * fija en lugar de la anterior. Si el usuario manda la huella que vio en el
   * aviso y la de ahora es otra, no se guarda nada: aceptaría algo que no vio.
   */
  async accept(serverId: string, user: User, expected?: string): Promise<AcceptHostKeyResult> {
    /* Comprueba que existe y es suyo (404/403 si no). */
    const server = await this.servers.findOne(serverId, user);
    /* La primera confirmación tiene que nombrar la huella que vio: aceptar «la
       que haya» sería otra vez confianza a ciegas. */
    if (!server.hostKeyFingerprint && !expected) {
      throw new BadRequestException('Indica la huella que comprobaste en el servidor');
    }
    const current: HostKey = await this.probe(server);

    if (expected && expected !== current.fingerprint) {
      throw new ConflictException({
        code: 'HOST_KEY_CHANGED',
        message:
          'La clave que presenta ahora el servidor no es la que se te mostró. No se aceptó nada: vuelve a conectar y revisa la huella.',
        received: current,
      });
    }

    const previous = {
      algorithm: server.hostKeyAlgorithm ?? null,
      fingerprint: server.hostKeyFingerprint ?? null,
    };
    const now = new Date();
    await this.repo.update(
      { id: server.id },
      { hostKeyAlgorithm: current.algorithm, hostKeyFingerprint: current.fingerprint, hostKeyVerifiedAt: now },
    );

    this.logger.warn(
      `🔑 Clave de host aceptada en ${server.name} (${server.host}:${server.port}) por ${user.email}: ` +
        `${previous.fingerprint ?? 'ninguna'} → ${current.fingerprint}`,
    );

    /* Queda en el historial y avisa a los demás equipos del usuario. */
    await this.notifications
      .create(user.id, {
        type: NotificationType.SECURITY,
        severity: NotificationSeverity.WARNING,
        title: previous.fingerprint ? 'Nueva clave de host aceptada' : 'Clave de host confirmada',
        body:
          `${server.name} (${server.host}:${server.port}) usa ahora ${current.algorithm} ${current.fingerprint}` +
          (previous.fingerprint ? `; antes ${previous.fingerprint}.` : '.') +
          ' Si no fuiste tú, revisa el servidor antes de volver a conectar.',
        serverId: server.id,
        metadata: {
          serverName: server.name,
          previousFingerprint: previous.fingerprint,
          fingerprint: current.fingerprint,
          algorithm: current.algorithm,
        },
      })
      .catch((err: unknown) =>
        this.logger.warn(`Aviso de clave de host no guardado: ${err instanceof Error ? err.message : String(err)}`),
      );

    return {
      serverId: server.id,
      previous,
      hostKeyAlgorithm: current.algorithm,
      hostKeyFingerprint: current.fingerprint,
      hostKeyVerifiedAt: now,
    };
  }
}
