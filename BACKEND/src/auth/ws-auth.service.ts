// src/auth/ws-auth.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';

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
  ) {}

  async authenticate(token?: string): Promise<User> {
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
    if (!user || !user.isActive) throw new Error('Usuario no autorizado');

    const session = await this.sessionsRepository.findOne({
      where: { id: payload.sid },
    });
    if (!session || session.revoked || session.userId !== user.id) {
      throw new Error('Sesión revocada');
    }

    return user;
  }
}
