// src/auth/ws-auth.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';
import type { Socket } from 'socket.io';
import {
  AUTH_REVOKED_EVENT,
  SESSION_END_MESSAGES,
  SessionEndReason,
  SessionSocketsService,
} from '@auth/session-sockets.service';

/**
 * Autenticación de los gateways WebSocket.
 *
 * Los sockets no pasan por `JwtAuthGuard`, así que cada gateway tenía que
 * verificar credenciales por su cuenta. Con dos gateways (terminal y SFTP) esa
 * lógica duplicada es un riesgo real: basta con que una copia se quede atrás
 * para abrir un agujero. Vive aquí una sola vez, con el mismo contrato que
 * `JwtStrategy`: solo vale un token de acceso de una sesión viva.
 */
@Injectable()
export class WsAuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionSockets: SessionSocketsService,
  ) {}

  /**
   * Con `client`, el socket queda registrado en su sesión (`SessionSocketsService`):
   * se corta en cuanto la sesión se revoca, expira o se cierra por inactividad.
   * Si la sesión ya terminó, el cliente recibe `auth:revoked` antes del error,
   * para distinguirlo de un token de acceso caducado (que se renueva y reintenta).
   */
  async authenticate(token?: string, client?: Socket): Promise<User & { sessionId: string }> {
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

    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      this.sessionOver(client, 'user');
      throw new Error('Usuario no autorizado');
    }

    const session = await this.sessionsRepository.findOne({
      where: { id: payload.sid },
    });
    if (!session || session.revoked || session.userId !== user.id) {
      this.sessionOver(client, 'revoked');
      throw new Error('Sesión revocada');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      this.sessionOver(client, 'expired');
      throw new Error('Sesión expirada');
    }

    if (client && !this.sessionSockets.register(client, session.id, user.id)) {
      throw new Error('Sesión revocada');
    }

    return Object.assign(user, { sessionId: session.id });
  }

  /**
   * Actividad del usuario por el socket (teclear en la terminal, operar en SFTP):
   * cuenta para el cierre por inactividad igual que una petición HTTP.
   */
  touch(client: Socket): void {
    this.sessionSockets.touch(client);
  }

  /** Limpieza propia del gateway cuando la sesión del socket termina. */
  onSessionEnd(client: Socket, fn: (reason: SessionEndReason) => void): void {
    this.sessionSockets.setOnEnd(client, fn);
  }

  private sessionOver(client: Socket | undefined, reason: SessionEndReason): void {
    client?.emit(AUTH_REVOKED_EVENT, { reason, message: SESSION_END_MESSAGES[reason] });
  }
}
