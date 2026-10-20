import type { NextFunction, Request, Response } from 'express';
import { isUpload, securityHeaders } from './http-hardening';

describe('http-hardening', () => {
  it('pone las cabeceras que impiden ejecutar o reinterpretar lo que sirve la nube', () => {
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; } } as unknown as Response;
    const next = jest.fn() as NextFunction;
    securityHeaders({} as Request, res, next);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain('sandbox');
    expect(headers['content-security-policy']).toContain("default-src 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['cache-control']).toBe('no-store');
    expect(next).toHaveBeenCalled();
  });

  it('solo PUT /api/v1/files es una subida', () => {
    expect(isUpload({ method: 'PUT', path: '/api/v1/files' })).toBe(true);
    expect(isUpload({ method: 'POST', path: '/api/v1/files' })).toBe(false);
    expect(isUpload({ method: 'PUT', path: '/api/v1/config/paths' })).toBe(false);
    expect(isUpload({ method: 'PUT', path: '/api/v1/files/x' })).toBe(false);
  });
});
