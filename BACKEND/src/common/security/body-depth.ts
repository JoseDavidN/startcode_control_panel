import type { NextFunction, Request, Response } from 'express';

/**
 * Anidamiento máximo de un cuerpo JSON o urlencoded. Ningún DTO pasa de unos
 * pocos niveles; un cuerpo de miles de `[[[…]]]` (10 KB bastan) desbordaba la
 * pila en la transformación y validación del ValidationPipe y respondía 500,
 * también en rutas públicas como el login.
 */
export const MAX_BODY_DEPTH = 64;

/** Recorre el valor sin recursión: un valor muy profundo no puede desbordar la pila aquí. */
export function exceedsDepth(value: unknown, max = MAX_BODY_DEPTH): boolean {
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (node === null || typeof node !== 'object') continue;
    if (depth >= max) return true;
    for (const child of Object.values(node as Record<string, unknown>)) {
      if (child !== null && typeof child === 'object') stack.push([child, depth + 1]);
    }
  }
  return false;
}

/** Middleware tras el parser del cuerpo: 400 si el cuerpo está anidado de más. */
export function rejectDeepBodies(max = MAX_BODY_DEPTH) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (exceedsDepth(req.body, max)) {
      res.status(400).json({ statusCode: 400, message: 'El cuerpo de la petición está demasiado anidado', error: 'Bad Request' });
      return;
    }
    next();
  };
}
