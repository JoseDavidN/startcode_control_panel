// src/sftp/services/sftp-session.service.ts
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import type { Client as SSHClient, SFTPWrapper } from 'ssh2';
import { SSHService } from '@monitoring/services/ssh.service';
import { ServersService } from '@servers/servers.service';
import { SftpSession } from '../sftp.types';

/**
 * Registro de sesiones SFTP vivas.
 *
 * El socket es quien decide cuándo abrir y cerrar: mientras el modal está
 * abierto hay conexión, y al cerrarse se cierra. El barrido periódico es la
 * red de seguridad para lo que el socket no puede contar (la app muere, la red
 * se corta), y respeta las subidas en vuelo, que van por HTTP y no dependen
 * del socket.
 *
 * El registro vive en memoria: con una sola instancia de backend es correcto.
 * Si algún día se escala horizontalmente, la subida podría aterrizar en un
 * nodo que no tiene la sesión y haría falta afinidad o mover esto a Redis.
 */
@Injectable()
export class SftpSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SftpSessionService.name);
  private readonly sessions = new Map<string, SftpSession>();

  private readonly idleTimeoutMs: number;
  private readonly maxSessionsPerUser: number;
  private readonly maxLifetimeMs = 2 * 60 * 60 * 1000;

  constructor(
    private readonly sshService: SSHService,
    private readonly serversService: ServersService,
    config: ConfigService,
  ) {
    this.idleTimeoutMs = Number(
      config.get('SFTP_IDLE_TIMEOUT_MS', 10 * 60 * 1000),
    );
    this.maxSessionsPerUser = Number(config.get('SFTP_MAX_SESSIONS_PER_USER', 3));
  }

  /** Abre una sesión para un servidor del usuario. */
  async open(
    userId: string,
    serverId: string,
    socketId: string,
  ): Promise<SftpSession> {
    const mine = [...this.sessions.values()].filter((s) => s.userId === userId);
    if (mine.length >= this.maxSessionsPerUser) {
      /* No se cierra la más vieja: puede estar subiendo algo. */
      throw new ForbiddenException(
        `Ya tienes ${mine.length} sesiones SFTP abiertas; cierra alguna antes de abrir otra`,
      );
    }

    // Comprueba que el servidor existe y es suyo, y trae la llave privada.
    const server = await this.serversService.findOneWithPrivateKey(
      serverId,
      userId,
    );

    const ssh = await this.sshService.createDedicatedClient(server);

    let meta: SFTPWrapper;
    let data: SFTPWrapper;
    try {
      [meta, data] = await Promise.all([
        this.openChannel(ssh),
        this.openChannel(ssh),
      ]);
    } catch (error) {
      try {
        ssh.end();
      } catch {
        /* ya cerrada */
      }
      throw error;
    }

    const home = await new Promise<string>((resolve) => {
      meta.realpath('.', (err, resolved) => resolve(err ? '/' : resolved));
    });

    const now = Date.now();
    const session: SftpSession = {
      id: randomUUID(),
      userId,
      serverId,
      serverName: server.name,
      host: server.host,
      username: server.username,
      ssh,
      meta,
      data,
      home,
      createdAt: now,
      lastUsedAt: now,
      activeUploads: 0,
      ensuredDirs: new Set<string>(),
      socketId,
      closing: false,
    };

    this.sessions.set(session.id, session);
    this.logger.log(
      `📂 Sesión SFTP abierta en ${server.name} (${session.id}) para el usuario ${userId}`,
    );

    return session;
  }

  /** Sesión del usuario; lanza si no existe o es de otro. */
  get(sessionId: string, userId: string): SftpSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.closing) {
      throw new NotFoundException('La sesión SFTP no existe o ya se cerró');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Esta sesión SFTP no es tuya');
    }
    return session;
  }

  getBySocket(socketId: string): SftpSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.socketId === socketId) return session;
    }
    return undefined;
  }

  touch(session: SftpSession): void {
    session.lastUsedAt = Date.now();
  }

  /**
   * El socket se fue. Si no hay subidas en vuelo se cierra ya; si las hay, se
   * deja viva y el barrido la recogerá cuando terminen.
   */
  onSocketGone(socketId: string): void {
    const session = this.getBySocket(socketId);
    if (!session) return;

    session.socketId = null;
    if (session.activeUploads === 0) {
      this.close(session.id, 'el cliente cerró la conexión');
    }
  }

  close(sessionId: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.closing) return;

    session.closing = true;
    this.sessions.delete(sessionId);

    for (const closeable of [session.meta, session.data]) {
      try {
        closeable.end();
      } catch {
        /* ya cerrado */
      }
    }
    try {
      session.ssh.end();
    } catch {
      /* ya cerrada */
    }

    this.logger.log(`📂 Sesión SFTP ${sessionId} cerrada: ${reason}`);
  }

  /** Barrido: sesiones inactivas, huérfanas o demasiado viejas. */
  @Interval(30_000)
  sweep(): void {
    const now = Date.now();

    for (const session of [...this.sessions.values()]) {
      if (session.activeUploads > 0) continue;

      if (session.socketId === null) {
        this.close(session.id, 'sin cliente');
      } else if (now - session.lastUsedAt > this.idleTimeoutMs) {
        this.close(session.id, 'inactividad');
      } else if (now - session.createdAt > this.maxLifetimeMs) {
        this.close(session.id, 'límite de vida de la sesión');
      }
    }
  }

  onModuleDestroy(): void {
    for (const session of [...this.sessions.values()]) {
      this.close(session.id, 'el backend se está apagando');
    }
  }

  private openChannel(ssh: SSHClient): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      ssh.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
    });
  }
}
