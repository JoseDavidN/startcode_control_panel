import { resolveCorsOrigins, TAURI_ORIGINS } from './cors-origins';

describe('resolveCorsOrigins', () => {
  it('sin configurar, solo la app de escritorio (nunca `*`)', () => {
    expect(resolveCorsOrigins('')).toEqual(TAURI_ORIGINS);
  });
  it('`*` solo si se pide', () => {
    expect(resolveCorsOrigins(' * ')).toBe('*');
  });
  it('añade los de Tauri a los configurados, sin barra final', () => {
    expect(resolveCorsOrigins('http://localhost:5173/')).toEqual(['http://localhost:5173', ...TAURI_ORIGINS]);
  });
});
