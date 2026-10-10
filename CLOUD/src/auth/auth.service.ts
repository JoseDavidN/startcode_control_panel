import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hashSync } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { cloudError } from '@/common/errors';
import { CloudConfig } from '@/common/cloud-config';
import { BCRYPT_ROUNDS, StateStore } from '@/state/state.store';
import type { CloudPrincipal, TokenPayload } from './auth.types';

/* Hash de relleno: con un usuario que no existe se compara igual, así el
   tiempo de respuesta no delata qué usuarios hay. */
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= hashSync('startcode-cloud', BCRYPT_ROUNDS));

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly state: StateStore,
    private readonly config: CloudConfig,
  ) {}

  async login(username: string, password: string, device = 'StartCode Panel'): Promise<{ token: string; username: string; expiresAt: string }> {
    const user = this.state.findUser(username.trim());
    const ok = await compare(password, user?.passwordHash ?? getDummyHash());
    if (!user || !ok) {
      throw cloudError(UnauthorizedException, 'BAD_CREDENTIALS', 'Usuario o contraseña incorrectos.');
    }
    const jti = randomUUID();
    const token = await this.jwt.signAsync({ sub: user.username, jti } satisfies TokenPayload, {
      expiresIn: this.config.tokenTtl as never,
    });
    const { exp } = this.jwt.decode<TokenPayload>(token);
    const now = new Date().toISOString();
    const expiresAt = new Date((exp ?? 0) * 1000).toISOString();
    await this.state.addSession({ jti, username: user.username, device: device.trim() || 'StartCode Panel', createdAt: now, lastSeenAt: now, expiresAt });
    return { token, username: user.username, expiresAt };
  }

  async logout(principal: CloudPrincipal): Promise<void> {
    await this.state.removeSession(principal.jti);
  }

  /** Valida firma, expiración y que la sesión no se haya revocado. */
  async verify(token: string): Promise<CloudPrincipal> {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw cloudError(UnauthorizedException, 'TOKEN_INVALID', 'La sesión de la nube expiró o no es válida.', 'Vuelve a conectar desde Configuración de Cloud.');
    }
    const session = this.state.findSession(payload.jti);
    if (!session || session.username !== payload.sub || !this.state.findUser(payload.sub)) {
      throw cloudError(UnauthorizedException, 'TOKEN_REVOKED', 'La sesión de la nube se cerró.', 'Vuelve a conectar desde Configuración de Cloud.');
    }
    void this.state.touchSession(payload.jti);
    return { username: session.username, jti: payload.jti };
  }
}
