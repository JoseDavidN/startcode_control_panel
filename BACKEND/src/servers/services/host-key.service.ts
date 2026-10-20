import { ConflictException, Injectable, Logger } from '@nestjs/common';
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
 * «Aceptar nueva huella»: el dueño del servidor confirma que el cambio de la
 * clave de host es legítimo (reinstalación, claves regeneradas…).
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

  /**
   * Vuelve a leer la clave que presenta ahora el host (sin autenticarse) y la
   * fija en lugar de la anterior. Si el usuario manda la huella que vio en el
   * aviso y la de ahora es otra, no se guarda nada: aceptaría algo que no vio.
   */
  async accept(serverId: string, user: User, expected?: string): Promise<AcceptHostKeyResult> {
    /* Comprueba que existe y es suyo (404/403 si no). */
    const server = await this.servers.findOne(serverId, user);
    const current: HostKey = await this.ssh.probeHostKey(server);

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
        title: 'Nueva clave de host aceptada',
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
