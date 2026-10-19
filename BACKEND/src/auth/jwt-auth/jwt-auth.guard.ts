import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import type { AuthenticatedUser } from '@auth/strategies/jwt.strategy';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  /** Passport entrega `false` como usuario cuando el token no es válido. */
  handleRequest<TUser = AuthenticatedUser>(err: Error | null, user: TUser | false | null): TUser {
    if (err) {
      throw err;
    }
    if (!user) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return user;
  }
}
