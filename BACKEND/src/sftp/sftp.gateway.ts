// src/sftp/sftp.gateway.ts
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { WsAuthService } from '@auth/ws-auth.service';
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
export class SftpGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SftpGateway.name);

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly sessions: SftpSessionService,
    private readonly ops: SftpOperationsService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const { token, serverId } = client.handshake.auth as {
      token?: string;
      serverId?: string;
    };

    try {
      const user = await this.wsAuth.authenticate(token);
      if (!serverId) throw new Error('Falta el servidor');

      const session = await this.sessions.open(user.id, serverId, client.id);
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
      client.emit('sftp:error', { message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.sessions.onSocketGone(client.id);
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
