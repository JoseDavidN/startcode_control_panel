import type { NextFunction, Request, Response } from 'express';
import { MAX_BODY_DEPTH, exceedsDepth, rejectDeepBodies } from '@/common/security/body-depth';

const nestedArray = (depth: number): unknown => JSON.parse('['.repeat(depth) + ']'.repeat(depth));
const nestedObject = (depth: number): unknown => {
  let value: unknown = 1;
  for (let i = 0; i < depth; i++) value = { a: value };
  return value;
};

describe('exceedsDepth', () => {
  it('acepta los cuerpos normales y los valores sin objetos', () => {
    expect(exceedsDepth({ email: 'a@b.c', password: 'x', rememberMe: true })).toBe(false);
    expect(exceedsDepth({ keys: [{ id: 1 }, { id: 2 }], values: { meta: { tags: ['a'] } } })).toBe(false);
    expect(exceedsDepth(undefined)).toBe(false);
    expect(exceedsDepth('texto')).toBe(false);
    expect(exceedsDepth(null)).toBe(false);
  });

  it('el límite es exacto: MAX niveles pasan, uno más no', () => {
    expect(exceedsDepth(nestedObject(MAX_BODY_DEPTH))).toBe(false);
    expect(exceedsDepth(nestedObject(MAX_BODY_DEPTH + 1))).toBe(true);
    expect(exceedsDepth(nestedArray(MAX_BODY_DEPTH))).toBe(false);
    expect(exceedsDepth(nestedArray(MAX_BODY_DEPTH + 1))).toBe(true);
  });

  it('un cuerpo de 100 000 niveles no desborda la pila', () => {
    expect(exceedsDepth({ email: nestedArray(100_000), password: 'x' })).toBe(true);
  });
});

describe('rejectDeepBodies', () => {
  const run = (body: unknown) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn() as NextFunction;
    rejectDeepBodies()({ body } as Request, res as unknown as Response, next);
    return { res, next };
  };

  it('responde 400 sin llegar al controlador', () => {
    const { res, next } = run({ email: nestedArray(5000), password: 'x' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('deja pasar un cuerpo normal', () => {
    const { res, next } = run({ email: 'a@b.c', password: 'x' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
