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
}
