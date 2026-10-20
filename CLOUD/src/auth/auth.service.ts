import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hashSync } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { cloudError } from '@/common/errors';
import { CloudConfig } from '@/common/cloud-config';
import { BCRYPT_ROUNDS, StateStore } from '@/state/state.store';
import type { Section } from '@/common/sections';
import type { CloudPrincipal, TokenPayload } from './auth.types';

/* Lo que dura un ticket de reproducción: una película larga con pausas, sin
   dejar un enlace útil durante días si se filtra. */
const STREAM_TICKET_TTL = '6h';

/* Hash de relleno: con un usuario que no existe se compara igual, así el
   tiempo de respuesta no delata qué usuarios hay. Se calcula al arrancar,
   no en el primer intento con un usuario inexistente (que tardaría más). */
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= hashSync('startcode-cloud', BCRYPT_ROUNDS));

@Injectable()
export class AuthService implements OnModuleInit {
  onModuleInit(): void {
    getDummyHash();
  }

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
    /* Un ticket de reproducción no sirve como sesión. */
    if (payload.typ) {
      throw cloudError(UnauthorizedException, 'TOKEN_INVALID', 'La sesión de la nube expiró o no es válida.', 'Vuelve a conectar desde Configuración de Cloud.');
    }
    return this.activePrincipal(payload);
  }

  /**
   * Ticket para reproducir un archivo con `<video src>`, que no puede mandar
   * `Authorization`. Va en la URL, vale para ese archivo solo y muere con la
   * sesión que lo pidió.
   */
  async streamTicket(
    principal: CloudPrincipal, section: Section, path: string, extra: Pick<TokenPayload, 'sid' | 'cap'> = {},
  ): Promise<{ ticket: string; expiresAt: string }> {
    const ticket = await this.jwt.signAsync(
      { sub: principal.username, jti: principal.jti, typ: 'stream', sec: section, path, ...extra } satisfies TokenPayload,
      { expiresIn: STREAM_TICKET_TTL },
    );
    const { exp } = this.jwt.decode<TokenPayload>(ticket);
    return { ticket, expiresAt: new Date((exp ?? 0) * 1000).toISOString() };
  }

  async verifyStreamTicket(ticket: string): Promise<{ principal: CloudPrincipal; section: Section; path: string; sid: string; cap: NonNullable<TokenPayload['cap']> }> {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(ticket);
    } catch {
      throw cloudError(UnauthorizedException, 'TICKET_INVALID', 'El enlace de reproducción expiró.', 'Vuelve a abrir el archivo.');
    }
    if (payload.typ !== 'stream' || !payload.sec || payload.path === undefined) {
      throw cloudError(UnauthorizedException, 'TICKET_INVALID', 'El enlace de reproducción no es válido.', 'Vuelve a abrir el archivo.');
    }
    return {
      principal: this.activePrincipal(payload),
      section: payload.sec as Section,
      path: payload.path,
      sid: payload.sid ?? payload.jti,
      cap: payload.cap ?? {},
    };
  }

  private activePrincipal(payload: TokenPayload): CloudPrincipal {
    const session = this.state.findSession(payload.jti);
    if (!session || session.username !== payload.sub || !this.state.findUser(payload.sub)) {
      throw cloudError(UnauthorizedException, 'TOKEN_REVOKED', 'La sesión de la nube se cerró.', 'Vuelve a conectar desde Configuración de Cloud.');
    }
    void this.state.touchSession(payload.jti);
    return { username: session.username, jti: payload.jti };
  }
}
