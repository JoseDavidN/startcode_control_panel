// src/servers/services/agent-token.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AuthService } from '@auth/auth.service';
import { Server } from '@servers/entities/server.entity';

/** Claims del token de un agente (`AuthService.generateAgentToken`). */
export interface AgentTokenClaims {
  sub?: string;
  type?: string;
  serverName?: string;
  /** Ausente en los tokens anteriores a 0.11.1. */
  jti?: string;
  iat?: number;
  exp?: number;
}

/** Ranura del servidor con la que coincidió el token presentado. */
export type AgentTokenSlot = 'current' | 'pending' | 'previous' | 'legacy';

export type AgentTokenCheck =
  | {
      ok: true;
      server: Server;
      /** `jti`, o `sha256:<hex>` para un token heredado. */
      tokenId: string;
      slot: AgentTokenSlot;
      /** Hay que mandarle al agente un token nuevo. */
      needsRotation: boolean;
    }
  | { ok: false; reason: AgentTokenRejection };

export type AgentTokenRejection =
  | 'invalid'
  | 'wrong_type'
  | 'wrong_server'
  | 'server_not_found'
  | 'revoked'
  | 'legacy_expired';

/**
 * Margen durante el que el token anterior a una rotación se sigue aceptando:
 * cubre mensajes en vuelo y el buffer del agente, firmados antes de cambiarlo.
 */
export const AGENT_TOKEN_GRACE_MS = 10 * 60_000;

/** Edad a partir de la cual se rota un token con el agente conectado. */
export const AGENT_TOKEN_ROTATE_AFTER_MS = 7 * 24 * 3_600_000;

/**
 * Fecha a partir de la cual ningún token sin `jti` (agentes anteriores a
 * 2.2.0, tokens de 365 días) vale, aunque esté fijado: un servidor apagado
 * que nunca llegó a rotar no conserva su token indefinidamente. Se cambia con
 * `AGENT_LEGACY_TOKEN_CUTOFF` (ISO 8601; una fecha pasada los corta ya).
 */
export const AGENT_LEGACY_TOKEN_CUTOFF_DEFAULT = '2026-12-01T00:00:00Z';

/** Columnas de token: `select: false` en la entidad, se piden aquí a propósito. */
const TOKEN_COLUMNS = [
  'agentTokenId',
  'agentTokenPendingId',
  'agentTokenPreviousId',
  'agentTokenPreviousUntil',
  'agentTokenIssuedAt',
  'agentTokenLegacy',
] as const;

/**
 * Ciclo de vida del token del agente: emisión, validación, rotación y
 * revocación.
 *
 * El JWT por sí solo no se puede invalidar, así que el servidor guarda el
 * identificador del único token vigente (más el pendiente de confirmar y el
 * anterior durante la gracia). Un token bien firmado pero que no está en esa
 * fila se rechaza: borrar el servidor, desinstalar, reinstalar o regenerar lo
 * dejan fuera al instante.
 *
 * Toda escritura es un UPDATE condicionado (compare-and-set): dos rotaciones o
 * un ACK que llega tarde no pueden pisarse entre sí.
 */
@Injectable()
export class AgentTokenService {
  private readonly logger = new Logger(AgentTokenService.name);

  constructor(
    @InjectRepository(Server)
    private readonly servers: Repository<Server>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  /* ── Emisión ───────────────────────────────────────────────────── */

  private sign(server: Pick<Server, 'id' | 'name'>): { token: string; jti: string } {
    const jti = crypto.randomUUID();
    return { token: this.auth.generateAgentToken(server.id, server.name, jti), jti };
  }

  /**
   * Token para una instalación. Entra como pendiente: el agente que ya corre
   * sigue funcionando si la instalación falla antes de tocar su configuración.
   * Al terminar bien, `activate` lo deja como único válido.
   */
  async issueForInstall(server: Pick<Server, 'id' | 'name'>): Promise<{ token: string; jti: string }> {
    const issued = this.sign(server);
    await this.servers.update(server.id, { agentTokenPendingId: issued.jti });
    return issued;
  }

  /**
   * Deja `tokenId` como único token válido, sin gracia para ningún otro. Es lo
   * que hace una reinstalación (o un token nuevo pedido a mano): el anterior
   * deja de servir en ese momento.
   */
  async activate(serverId: string, tokenId: string): Promise<void> {
    await this.servers.update(serverId, {
      agentTokenId: tokenId,
      agentTokenIssuedAt: new Date(),
      agentTokenPendingId: null,
      agentTokenPreviousId: null,
      agentTokenPreviousUntil: null,
      agentTokenLegacy: false,
    });
  }

  /** Emite un token y lo deja como único válido (instalación manual). */
  async issueAndActivate(server: Pick<Server, 'id' | 'name'>): Promise<string> {
    const issued = this.sign(server);
    await this.activate(server.id, issued.jti);
    return issued.token;
  }

  /** Ningún token vale para este servidor hasta que se reinstale el agente. */
  async revoke(serverId: string): Promise<void> {
    await this.servers.update(serverId, {
      agentTokenId: null,
      agentTokenIssuedAt: null,
      agentTokenPendingId: null,
      agentTokenPreviousId: null,
      agentTokenPreviousUntil: null,
      agentTokenLegacy: false,
    });
  }

  /* ── Rotación ──────────────────────────────────────────────────── */

  /**
   * Primer paso de una rotación: emite el token nuevo y lo registra como
   * pendiente. El vigente no cambia hasta que el agente confirme que lo guardó.
   * Una rotación anterior sin confirmar queda sustituida: si el agente se
   * presenta con el token vigente, es que aquella no llegó a guardarse.
   */
  async beginRotation(server: Pick<Server, 'id' | 'name'>): Promise<{ token: string; jti: string }> {
    const issued = this.sign(server);
    await this.servers.update(server.id, { agentTokenPendingId: issued.jti });
    return issued;
  }

  /**
   * Segundo paso: el agente demostró tener el token pendiente (ACK, o un
   * mensaje firmado con él si el ACK se perdió). Pasa a vigente y el anterior
   * queda en gracia `AGENT_TOKEN_GRACE_MS`. Devuelve false si ya no estaba
   * pendiente (otra rotación o una revocación llegaron antes).
   */
  async confirmRotation(serverId: string, tokenId: string): Promise<boolean> {
    const result: unknown = await this.servers.query(
      `UPDATE tbl_servers
          SET str_agent_token_previous_id    = str_agent_token_id,
              dat_agent_token_previous_until = CASE WHEN str_agent_token_id IS NULL THEN NULL
                                                    ELSE $3::timestamptz END,
              str_agent_token_id             = str_agent_token_pending_id,
              str_agent_token_pending_id     = NULL,
              dat_agent_token_issued         = now(),
              bol_agent_token_legacy         = FALSE
        WHERE id = $1 AND str_agent_token_pending_id = $2`,
      [serverId, tokenId, new Date(Date.now() + AGENT_TOKEN_GRACE_MS)],
    );
    return affectedRows(result) > 0;
  }

  /* ── Validación ────────────────────────────────────────────────── */

  /**
   * Valida el token que presenta un agente para `serverId`.
   *
   * Lanza solo ante errores de infraestructura (base de datos caída): eso no
   * es un 401 y el agente no debe tratarlo como revocación.
   */
  async verify(token: string, serverId: string): Promise<AgentTokenCheck> {
    let claims: AgentTokenClaims;
    try {
      claims = this.jwt.verify<AgentTokenClaims>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      return { ok: false, reason: 'invalid' };
    }

    if (claims.type !== 'agent') return { ok: false, reason: 'wrong_type' };
    if (!claims.sub || claims.sub !== serverId) return { ok: false, reason: 'wrong_server' };

    const server = await this.servers
      .createQueryBuilder('server')
      .addSelect(TOKEN_COLUMNS.map((column) => `server.${column}`))
      .where('server.id = :id', { id: serverId })
      .getOne();
    if (!server) return { ok: false, reason: 'server_not_found' };

    const tokenId = AgentTokenService.tokenIdOf(token, claims);
    if (!claims.jti && Date.now() >= this.legacyCutoff().getTime()) {
      return { ok: false, reason: 'legacy_expired' };
    }
    const shouldRotate = this.isDueForRotation(claims);

    if (server.agentTokenId === tokenId) {
      return { ok: true, server, tokenId, slot: 'current', needsRotation: shouldRotate };
    }

    if (server.agentTokenPendingId === tokenId) {
      /* Firmado con el pendiente: el agente lo guardó y el ACK se perdió (o
         llega por detrás). Se confirma aquí mismo. */
      if (await this.confirmRotation(server.id, tokenId)) {
        this.logger.log(`🔑 Token del agente de ${server.name} rotado (confirmado por uso)`);
      }
      return { ok: true, server, tokenId, slot: 'pending', needsRotation: false };
    }

    if (
      server.agentTokenPreviousId === tokenId &&
      server.agentTokenPreviousUntil &&
      server.agentTokenPreviousUntil.getTime() > Date.now()
    ) {
      return { ok: true, server, tokenId, slot: 'previous', needsRotation: false };
    }

    if (!claims.jti && server.agentTokenLegacy) {
      /* Token anterior a 0.11.1. Se fija su huella como vigente —desde ahora
         cualquier otro token heredado de este servidor deja de valer— y se
         pide su rotación al esquema nuevo. */
      const pinned = await this.pinLegacy(server.id, tokenId);
      if (pinned) {
        this.logger.log(`🔑 Token heredado del agente de ${server.name} fijado; se rotará`);
        return { ok: true, server, tokenId, slot: 'legacy', needsRotation: true };
      }
      /* Otro token heredado se fijó antes: se reevalúa contra la fila nueva. */
      return this.verify(token, serverId);
    }

    return { ok: false, reason: 'revoked' };
  }

  /** `jti` del token, o la huella del token entero si es heredado. */
  static tokenIdOf(token: string, claims: Pick<AgentTokenClaims, 'jti'>): string {
    if (claims.jti) return claims.jti;
    return `sha256:${crypto.createHash('sha256').update(token).digest('hex')}`;
  }

  /**
   * Rotar cuando el token haya cumplido `AGENT_TOKEN_ROTATE_AFTER_MS` o un
   * cuarto de su vida (si se configura una vida más corta), y siempre si es
   * heredado.
   */
  isDueForRotation(claims: AgentTokenClaims, now = Date.now()): boolean {
    if (!claims.jti || !claims.iat) return true;
    const age = now - claims.iat * 1000;
    const lifetime = claims.exp ? (claims.exp - claims.iat) * 1000 : Infinity;
    return age >= Math.min(AGENT_TOKEN_ROTATE_AFTER_MS, lifetime / 4);
  }

  /** Fin de la validez de los tokens heredados; una fecha inválida no amplía nada. */
  legacyCutoff(): Date {
    const raw = this.config.get<string>('AGENT_LEGACY_TOKEN_CUTOFF')?.trim();
    const parsed = raw ? new Date(raw) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
    if (raw) this.logger.warn(`AGENT_LEGACY_TOKEN_CUTOFF no es una fecha válida: se usa ${AGENT_LEGACY_TOKEN_CUTOFF_DEFAULT}`);
    return new Date(AGENT_LEGACY_TOKEN_CUTOFF_DEFAULT);
  }

  /** Estado para la interfaz: nada de identificadores, solo fechas. */
  async describe(
    serverId: string,
  ): Promise<{ issuedAt: Date | null; rotating: boolean; legacyUntil: Date | null }> {
    const server = await this.servers
      .createQueryBuilder('server')
      .select(['server.id'])
      .addSelect(TOKEN_COLUMNS.map((column) => `server.${column}`))
      .where('server.id = :id', { id: serverId })
      .getOne();

    return {
      issuedAt: server?.agentTokenIssuedAt ?? null,
      rotating: Boolean(server?.agentTokenPendingId),
      /* Heredado: sin fijar todavía o fijado por su huella. Vale hasta el corte. */
      legacyUntil:
        server && (server.agentTokenLegacy || server.agentTokenId?.startsWith('sha256:'))
          ? this.legacyCutoff()
          : null,
    };
  }

  private async pinLegacy(serverId: string, tokenId: string): Promise<boolean> {
    const result: unknown = await this.servers.query(
      `UPDATE tbl_servers
          SET str_agent_token_id     = $2,
              dat_agent_token_issued = now(),
              bol_agent_token_legacy = FALSE
        WHERE id = $1 AND bol_agent_token_legacy = TRUE`,
      [serverId, tokenId],
    );
    return affectedRows(result) > 0;
  }
}

/** `query()` de TypeORM con Postgres devuelve `[filas, afectadas]` en un UPDATE. */
function affectedRows(result: unknown): number {
  if (Array.isArray(result) && typeof result[1] === 'number') return result[1];
  return 0;
}
