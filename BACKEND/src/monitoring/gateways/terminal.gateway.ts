import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { StringDecoder } from 'node:string_decoder';
import { Logger } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Server as IoServer, Socket } from 'socket.io';
import type { ClientChannel, Client as SSHClient } from 'ssh2';
import { WsAuthService } from '@auth/ws-auth.service';
import { SSHService } from '../services/ssh.service';
import { ServersService } from '@servers/servers.service';
import { hostKeyErrorPayload } from '@monitoring/services/host-key';

interface TerminalSession {
  ssh: SSHClient;
  stream: ClientChannel;
  serverId: string;
  userId: string;
}

/**
 * Terminal SSH interactiva sobre WebSocket.
 *
 * Una conexión = una shell. El cliente se autentica con su token de acceso en
 * el handshake y pide un servidor concreto; se comprueba que sea suyo antes de
 * abrir nada. La conexión SSH es dedicada (no la del pool de monitoreo), porque
 * ese pool se recicla en cada comando y cortaría la sesión del usuario.
 */
@WebSocketGateway({ namespace: '/terminal' })
export class TerminalGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: IoServer;

  private readonly logger = new Logger(TerminalGateway.name);

  /** socket.id → shell abierta */
  private sessions = new Map<string, TerminalSession>();

  constructor(
    private serversService: ServersService,
    private wsAuth: WsAuthService,
    private sshService: SSHService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const { token, serverId, cols, rows } = client.handshake.auth as {
      token?: string;
      serverId?: string;
      cols?: number;
      rows?: number;
    };

    try {
      const user = await this.wsAuth.authenticate(token, client);
      const server = await this.resolveServer(serverId, user.id);

      const ssh = await this.sshService.createDedicatedClient(server);
      /* La pestaña pudo cerrarse mientras se conectaba: handleDisconnect ya
         corrió sin sesión que limpiar, así que esta conexión se cierra aquí. */
      if (client.disconnected) {
        ssh.end();
        return;
      }

      const stream = await new Promise<ClientChannel>((resolve, reject) => {
        ssh.shell(
          {
            term: 'xterm-256color',
            cols: this.clamp(cols, 80),
            rows: this.clamp(rows, 24),
          },
          (err, channel) => (err ? reject(err) : resolve(channel)),
        );
      });

      if (client.disconnected) {
        try { stream.end(); } catch { /* ya cerrado */ }
        ssh.end();
        return;
      }

      this.sessions.set(client.id, { ssh, stream, serverId: server.id, userId: user.id });

      /* Un carácter de varios bytes (acentos, iconos Nerd Font de nvim) puede
         llegar partido entre dos fragmentos: el decodificador guarda los bytes
         sueltos hasta completarlo, en vez de convertir cada fragmento aparte. */
      const out = new StringDecoder('utf8');
      const err = new StringDecoder('utf8');
      stream.on('data', (chunk: Buffer) => {
        const text = out.write(chunk);
        if (text) client.emit('terminal:output', text);
      });
      stream.stderr?.on('data', (chunk: Buffer) => {
        const text = err.write(chunk);
        if (text) client.emit('terminal:output', text);
      });
      stream.on('close', () => {
        client.emit('terminal:closed', { reason: 'La sesión remota terminó' });
        this.cleanup(client.id);
        client.disconnect(true);
      });

      /* Abrir la terminal es actividad del usuario; lo que empuja la shell no. */
      this.wsAuth.touch(client);
      client.emit('terminal:ready', {
        serverName: server.name,
        user: server.username,
        host: server.host,
      });

      this.logger.log(`🖥️  Terminal abierta: ${server.name} (usuario ${user.email})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(`Terminal rechazada: ${message}`);
      /* Clave de host cambiada: el panel enseña el aviso con las dos huellas. */
      client.emit('terminal:error', { message, ...hostKeyErrorPayload(error) });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.cleanup(client.id);
  }

  @SubscribeMessage('terminal:input')
  onInput(@ConnectedSocket() client: Socket, @MessageBody() data: string): void {
    const session = this.sessions.get(client.id);
    if (session && typeof data === 'string') {
      session.stream.write(data);
      this.wsAuth.touch(client);
    }
  }

  @SubscribeMessage('terminal:resize')
  onResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() size: { cols: number; rows: number },
  ): void {
    const session = this.sessions.get(client.id);
    if (!session) return;
    const cols = this.clamp(size?.cols, 80);
    const rows = this.clamp(size?.rows, 24);
    session.stream.setWindow(rows, cols, 0, 0);
  }

  /* ── Internos ──────────────────────────────────────────────────────── */

  /** El servidor debe existir y ser del usuario. La llave llega descifrada (solo en memoria). */
  private async resolveServer(serverId: string | undefined, userId: string) {
    if (!serverId) throw new Error('Falta el servidor');
    /* Un id con otro formato llegaría a Postgres y su error («invalid input syntax for type uuid») al cliente. */
    if (typeof serverId !== 'string' || !isUUID(serverId)) throw new Error('Servidor no válido');
    return this.serversService.findOneWithPrivateKey(serverId, userId);
  }

  private cleanup(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (!session) return;

    try { session.stream.end(); } catch { /* ya cerrado */ }
    try { session.ssh.end(); } catch { /* ya cerrado */ }

    this.sessions.delete(socketId);
    this.logger.debug(`Terminal cerrada para el socket ${socketId}`);
  }

  private clamp(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(500, Math.max(10, Math.round(value)));
  }
}
