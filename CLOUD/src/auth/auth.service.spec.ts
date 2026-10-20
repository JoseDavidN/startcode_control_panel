import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'crypto';
import type { CloudConfig } from '@/common/cloud-config';
import type { StateStore } from '@/state/state.store';
import { jwtOptions } from './auth.module';
import { AuthService } from './auth.service';

/* JWT firmado a mano (jsonwebtoken no es dependencia directa): permite probar otros `alg`. */
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
function sign(payload: Record<string, unknown>, secret: string, { algorithm, expiresIn }: { algorithm: 'HS256' | 'HS512'; expiresIn?: number }) {
  const body = { iat: Math.floor(Date.now() / 1000), ...payload, ...(expiresIn ? { exp: Math.floor(Date.now() / 1000) + expiresIn } : {}) };
  const head = `${b64({ alg: algorithm, typ: 'JWT' })}.${b64(body)}`;
  return `${head}.${createHmac(algorithm === 'HS256' ? 'sha256' : 'sha512', secret).update(head).digest('base64url')}`;
}

describe('AuthService.verify', () => {
  const secret = 'x'.repeat(48);
  const config = { jwtSecret: secret, tokenTtl: '1h' } as unknown as CloudConfig;
  const sessions = new Set(['s1']);
  const state = {
    findSession: (jti: string) => (sessions.has(jti) ? { jti, username: 'bob' } : undefined),
    findUser: (u: string) => (u === 'bob' ? { username: 'bob' } : undefined),
    touchSession: () => Promise.resolve(),
  } as unknown as StateStore;
  const jwt = new JwtService(jwtOptions(config));
  const auth = new AuthService(jwt, state, config);

  it('acepta un token HS256 de una sesión activa', async () => {
    const token = sign({ sub: 'bob', jti: 's1' }, secret, { algorithm: 'HS256', expiresIn: 60 });
    await expect(auth.verify(token)).resolves.toEqual({ username: 'bob', jti: 's1' });
  });
  it('rechaza otro algoritmo aunque esté firmado con el mismo secreto', async () => {
    const token = sign({ sub: 'bob', jti: 's1' }, secret, { algorithm: 'HS512', expiresIn: 60 });
    await expect(auth.verify(token)).rejects.toMatchObject({ status: 401 });
  });
  it('rechaza alg none, expirados y sesiones revocadas', async () => {
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"bob","jti":"s1"}').toString('base64url')}.`;
    await expect(auth.verify(none)).rejects.toMatchObject({ status: 401 });
    const expired = sign({ sub: 'bob', jti: 's1', exp: Math.floor(Date.now() / 1000) - 10 }, secret, { algorithm: 'HS256' });
    await expect(auth.verify(expired)).rejects.toMatchObject({ status: 401 });
    const revoked = sign({ sub: 'bob', jti: 'otra' }, secret, { algorithm: 'HS256', expiresIn: 60 });
    await expect(auth.verify(revoked)).rejects.toMatchObject({ status: 401 });
  });
  it('un ticket de reproducción no vale como sesión ni al revés', async () => {
    const { ticket } = await auth.streamTicket({ username: 'bob', jti: 's1' }, 'home', 'v.mp4');
    await expect(auth.verify(ticket)).rejects.toMatchObject({ status: 401 });
    const session = sign({ sub: 'bob', jti: 's1' }, secret, { algorithm: 'HS256', expiresIn: 60 });
    await expect(auth.verifyStreamTicket(session)).rejects.toMatchObject({ status: 401 });
  });
  it('un ticket de otro usuario no sirve si su sesión no es de ese usuario', async () => {
    const forged = sign({ sub: 'eve', jti: 's1', typ: 'stream', sec: 'home', path: 'x.mp4' }, secret, { algorithm: 'HS256', expiresIn: 60 });
    await expect(auth.verifyStreamTicket(forged)).rejects.toMatchObject({ status: 401 });
  });
});
