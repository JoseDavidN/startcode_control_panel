import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Session } from '../entities/session.entity';
import { mergePreferences } from '../types/user-preferences.type';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** Propósito del token. Solo `access` sirve como credencial. */
  type?: string;
  /** Sesión a la que pertenece el token. */
  sid?: string;
}

/** Usuario autenticado + la sesión con la que entró. */
export type AuthenticatedUser = User & { sessionId?: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /** No se escribe `lastUsed` en cada petición: basta con un latido por minuto. */
  private readonly LAST_USED_THROTTLE_MS = 60_000;

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Session)
    private sessionsRepository: Repository<Session>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') as string,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    /* Todos los tokens del sistema (2FA pendiente, refresh, agente) se firman con
       el mismo secreto: sin comprobar el propósito, cualquiera de ellos valdría
       como credencial de acceso. */
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token no válido para esta operación');
    }

    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    if (!payload.sid) {
      throw new UnauthorizedException('Token sin sesión asociada');
    }

    const session = await this.sessionsRepository.findOne({ where: { id: payload.sid } });

    if (!session || session.revoked || session.userId !== user.id) {
      throw new UnauthorizedException('Sesión revocada');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sesión expirada');
    }

    /* Cierre por inactividad del lado del servidor: el temporizador del navegador
       se reinicia al recargar la página, este no. */
    const timeoutMinutes = mergePreferences(user.preferences, {}).security.sessionTimeout;
    const idleMs = Date.now() - session.lastUsed.getTime();

    if (timeoutMinutes > 0 && idleMs > timeoutMinutes * 60_000) {
      await this.sessionsRepository.update(session.id, { revoked: true });
      throw new UnauthorizedException('Sesión cerrada por inactividad');
    }

    if (idleMs > this.LAST_USED_THROTTLE_MS) {
      await this.sessionsRepository.update(session.id, { lastUsed: new Date() });
    }

    return Object.assign(user, { sessionId: session.id });
  }
}
