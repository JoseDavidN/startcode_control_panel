import type { NextFunction, Request, Response } from 'express';

/* ── Cabeceras y tiempos de cada petición ─────────────────────────────
   Sin helmet (una dependencia para cinco cabeceras): lo que la nube sirve
   son datos y archivos, nunca páginas, así que la política es la más
   cerrada. Si alguien abre en un navegador una URL de la nube, nada se
   ejecuta (`sandbox`) ni se interpreta con otro tipo (`nosniff`). */

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  /* Respuestas con tokens o datos privados: que nada intermedio las guarde.
     Quien quiera caché (la reproducción) pone la suya después. */
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/** La subida de archivos: su cuerpo puede tardar horas. */
export const isUpload = (req: Pick<Request, 'method' | 'path'>) =>
  req.method === 'PUT' && /^\/api\/v1\/files\/?$/.test(req.path);

/**
 * El servidor no tiene límite total por petición (`requestTimeout = 0`) para
 * que quepan las subidas grandes; sin esto, cualquiera sin sesión podría
 * mandar un cuerpo byte a byte y retener conexiones sin fin (slowloris).
 * - Peticiones normales: el cuerpo debe llegar entero en `bodyMs`.
 * - Subidas: se cortan si pasan `idleMs` sin recibir nada; al terminar el
 *   cuerpo se quita el límite (la respuesta y keep-alive siguen como siempre).
 * Las descargas no se ven afectadas: solo cuenta lo que manda el cliente.
 */
export function requestBodyTimeout(bodyMs = 60_000, idleMs = 120_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isUpload(req)) {
      const socket = req.socket;
      /* Sin oyentes de 'timeout' en req/res/servidor, Node destruye el socket. */
      socket.setTimeout(idleMs);
      req.once('end', () => socket.setTimeout(0));
    } else {
      const timer = setTimeout(() => {
        if (!req.complete) req.socket.destroy();
      }, bodyMs);
      timer.unref();
      res.once('close', () => clearTimeout(timer));
      req.once('end', () => clearTimeout(timer));
    }
    next();
  };
}
