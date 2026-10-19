import type { Request } from 'express';
import type { AuthenticatedUser } from '@auth/strategies/jwt.strategy';

/** Petición que ya pasó por `JwtAuthGuard`: `JwtStrategy.validate` deja el usuario en `user`. */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
