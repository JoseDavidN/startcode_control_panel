import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { cloudError } from '@/common/errors';
import { AuthService } from './auth.service';
import type { AuthedRequest } from './auth.types';

/** Exige `Authorization: Bearer <token>` de una sesión activa y deja el usuario en `req.user`. */
@Injectable()
export class CloudAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw cloudError(UnauthorizedException, 'TOKEN_MISSING', 'Falta la sesión de la nube.', 'Conecta el panel desde Configuración de Cloud.');
    }
    req.user = await this.auth.verify(token);
    return true;
  }
}
