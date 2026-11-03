// src/sftp/sftp.gateway.ts
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Socket } from 'socket.io';
import { WsAuthService } from '@auth/ws-auth.service';
import { hostKeyErrorPayload } from '@monitoring/services/host-key';
import { SftpSessionService } from './services/sftp-session.service';
import { SftpOperationsService } from './services/sftp-operations.service';
import { SftpEntry, SftpSession } from './sftp.types';

type Ack<T> = ({ ok: true } & T) | { ok: false; message: string };

/**
 * Sesión SFTP interactiva sobre WebSocket.
 *
 * Aquí viven la sesión y los metadatos (listar, crear carpetas): son mensajes
 * pequeños y frecuentes, y el `disconnect` es la única señal fiable de que el
 * modal se cerró, que es cuando hay que soltar la conexión SSH. Los bytes de
 * los archivos van por HTTP (`SftpController`), donde el progreso y el
 * streaming salen gratis.
 */
@WebSocketGateway({ namespace: '/sftp' })
export class SftpGateway implements OnGatewayConnection {
  private readonly logger = new Logger(SftpGateway.name);

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly sessions: SftpSessionService,
    private readonly ops: SftpOperationsService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const { token, serverId, resume } = client.handshake.auth as {
      token?: string;
      serverId?: string;
      /** Sesión que tenía antes de que se cortara el socket */
      resume?: string;
    };

    /* Se escucha ya, antes de cualquier await. «client namespace disconnect»
       es el cliente cerrando el modal; cualquier otro motivo es un corte, y
       la sesión espera a que vuelva. */
    client.once('disconnect', (reason: string) =>
      this.sessions.onSocketGone(client.id, reason === 'client namespace disconnect'),
    );

    try {
      const user = await this.wsAuth.authenticate(token, client);
      if (!serverId) throw new Error('Falta el servidor');
      if (typeof serverId !== 'string' || !isUUID(serverId)) throw new Error('Servidor no válido');

      const resumed =
        typeof resume === 'string' && isUUID(resume)
          ? this.sessions.reattach(resume, user.id, serverId, client.id)
          : null;
      const session = resumed ?? (await this.sessions.open(user.id, serverId, client.id));
      /* Sesión revocada: se cierra ya, aunque haya subidas en vuelo (que al
         desconectar normal sí se esperan). */
      this.wsAuth.onSessionEnd(client, () =>
        this.sessions.close(session.id, 'la sesión del panel terminó'),
      );
      if (client.disconnected) {
        /* Una recuperada vuelve a esperar: puede tener subidas en curso. */
        if (resumed) this.sessions.release(session);
        else this.sessions.close(session.id, 'el cliente cerró la conexión');
        return;
      }
      this.wsAuth.touch(client);
      const listing = await this.ops.list(session, session.home);

      client.emit('sftp:ready', {
        sessionId: session.id,
        serverName: session.serverName,
        user: session.username,
        host: session.host,
        home: session.home,
        cwd: listing.path,
        entries: listing.entries,
      });

      this.logger.log(
        `📂 SFTP abierto en ${session.serverName} para ${user.email}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(`SFTP rechazado: ${message}`);
      /* Clave de host cambiada: el panel enseña el aviso con las dos huellas. */
      client.emit('sftp:error', { message, ...hostKeyErrorPayload(error) });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('sftp:list')
  async onList(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { path?: string },
  ): Promise<Ack<{ path: string; entries: SftpEntry[] }>> {
    return this.run(client, (session) => this.ops.list(session, body?.path));
  }

  @SubscribeMessage('sftp:mkdir')
  async onMkdir(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { path: string; name?: string },
  ): Promise<Ack<{ path: string }>> {
    return this.run(client, async (session) => ({
      path: await this.ops.mkdir(session, body?.path, body?.name),
    }));
  }

  @SubscribeMessage('sftp:mkdirp')
  async onMkdirp(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { base: string; dirs: string[] },
  ): Promise<Ack<{ created: number }>> {
    return this.run(client, async (session) => ({
      created: await this.ops.mkdirp(session, body?.base, body?.dirs ?? []),
    }));
  }

  /** Borra el archivo a medias de una subida por partes que no terminó. */
  @SubscribeMessage('sftp:discard')
  async onDiscard(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { destDir: string; relPath: string },
  ): Promise<Ack<{ discarded: boolean }>> {
    return this.run(client, async (session) => ({
      discarded: await this.ops.discardPartial(session, body?.destDir, body?.relPath),
    }));
  }

  @SubscribeMessage('sftp:realpath')
  async onRealpath(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { path: string },
  ): Promise<Ack<{ path: string }>> {
    return this.run(client, async (session) => ({
      path: await this.ops.realpath(session, body?.path),
    }));
  }

  /**
   * Resuelve la sesión del socket y traduce cualquier fallo a un ack con
   * `ok:false`. Un error de SFTP —una ruta que no existe, permiso denegado— no
   * debe tumbar el socket: el usuario sigue navegando por otro sitio.
   */
  private async run<T>(
    client: Socket,
    action: (session: SftpSession) => Promise<T>,
  ): Promise<Ack<T>> {
    const session = this.sessions.getBySocket(client.id);
    if (!session) {
      return { ok: false, message: 'La sesión SFTP ya no está abierta' };
    }

    try {
      this.sessions.touch(session);
      this.wsAuth.touch(client);
      const result = await action(session);
      return { ok: true, ...result };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.debug(`Operación SFTP fallida: ${message}`);
      return { ok: false, message };
    }
  }
}
