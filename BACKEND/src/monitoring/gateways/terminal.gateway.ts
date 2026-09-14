import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server as IoServer, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ClientChannel, Client as SSHClient } from 'ssh2';
import { Server as ServerEntity } from '@servers/entities/server.entity';
import { User } from '@auth/entities/user.entity';
import { Session } from '@auth/entities/session.entity';
import { SSHService } from '../services/ssh.service';

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
    @InjectRepository(ServerEntity)
    private serversRepository: Repository<ServerEntity>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Session)
    private sessionsRepository: Repository<Session>,
    private jwtService: JwtService,
    private configService: ConfigService,
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
      const user = await this.authenticate(token);
      const server = await this.resolveServer(serverId, user.id);

      const ssh = await this.sshService.createDedicatedClient(server);

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

      this.sessions.set(client.id, { ssh, stream, serverId: server.id, userId: user.id });

      stream.on('data', (chunk: Buffer) =>
        client.emit('terminal:output', chunk.toString('utf8')),
      );
      stream.stderr?.on('data', (chunk: Buffer) =>
        client.emit('terminal:output', chunk.toString('utf8')),
      );
      stream.on('close', () => {
        client.emit('terminal:closed', { reason: 'La sesión remota terminó' });
        this.cleanup(client.id);
        client.disconnect(true);
      });

      client.emit('terminal:ready', {
        serverName: server.name,
        user: server.username,
        host: server.host,
      });

      this.logger.log(`🖥️  Terminal abierta: ${server.name} (usuario ${user.email})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(`Terminal rechazada: ${message}`);
      client.emit('terminal:error', { message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.cleanup(client.id);
  }

  @SubscribeMessage('terminal:input')
  onInput(@ConnectedSocket() client: Socket, @MessageBody() data: string): void {
    const session = this.sessions.get(client.id);
    if (session && typeof data === 'string') session.stream.write(data);
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

  /** Mismo contrato que JwtStrategy: solo un access token de sesión viva vale. */
  private async authenticate(token?: string): Promise<User> {
    if (!token) throw new Error('Falta el token de acceso');

    let payload: { sub: string; type?: string; sid?: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new Error('Token inválido o expirado');
    }

    if (payload.type !== 'access' || !payload.sid) {
      throw new Error('Token no válido para esta operación');
    }

    const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new Error('Usuario no autorizado');

    const session = await this.sessionsRepository.findOne({ where: { id: payload.sid } });
    if (!session || session.revoked || session.userId !== user.id) {
      throw new Error('Sesión revocada');
    }

    return user;
  }

  /** El servidor debe existir y ser del usuario; la llave no se selecciona por defecto. */
  private async resolveServer(serverId: string | undefined, userId: string) {
    if (!serverId) throw new Error('Falta el servidor');

    const server = await this.serversRepository
      .createQueryBuilder('server')
      .addSelect('server.privateKey')
      .where('server.id = :serverId', { serverId })
      .getOne();

    if (!server) throw new Error('Servidor no encontrado');
    if (server.ownerId !== userId) throw new Error('No tienes acceso a este servidor');

    return server;
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
