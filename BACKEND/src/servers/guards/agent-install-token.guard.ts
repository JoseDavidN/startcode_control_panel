// src/servers/guards/agent-install-token.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Deja pasar solo al token corto que el panel genera para una instalación.
 *
 * Quien llama aquí es `curl` corriendo en el servidor remoto, no el navegador,
 * así que no vale `JwtAuthGuard`. Se exige `type: 'agent-install'`: ni un token
 * de sesión ni el del agente sirven para descargar el binario, y al revés
 * tampoco (`JwtStrategy` exige `type: 'access'`).
 */
@Injectable()
export class AgentInstallTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      throw new UnauthorizedException('Falta el token de instalación');
    }

    let payload: { sub?: string; type?: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token de instalación inválido o caducado');
    }

    if (payload.type !== 'agent-install' || !payload.sub) {
      throw new UnauthorizedException('Token no válido para descargar el agente');
    }

    /* Queda registrado a qué servidor pertenece la descarga. */
    (request as Request & { installServerId?: string }).installServerId = payload.sub;
    return true;
  }
}
