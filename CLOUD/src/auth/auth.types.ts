import type { Request } from 'express';

export interface CloudPrincipal {
  username: string;
  jti: string;
}

export interface AuthedRequest extends Request {
  user: CloudPrincipal;
}

export interface TokenPayload {
  sub: string;
  jti: string;
  exp?: number;
  /** Solo en los tickets de reproducción: no valen como sesión. */
  typ?: 'stream';
  sec?: string;
  path?: string;
  /** Id de la reproducción: al saltar, la conversión anterior de ese video se corta. */
  sid?: string;
  /** Lo que el webview reproduce por sí mismo (ver `ClientCaps`). */
  cap?: { hevc?: boolean; vp9?: boolean; av1?: boolean; webm?: boolean };
}
