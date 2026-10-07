import { resolveCorsOrigins, TAURI_ORIGINS } from './cors-origins';

describe('resolveCorsOrigins', () => {
  it('mantiene * tal cual', () => {
    expect(resolveCorsOrigins('*')).toBe('*');
  });

  it('separa la lista, quita barras finales y añade los orígenes de Tauri', () => {
    expect(resolveCorsOrigins('http://localhost:5173, https://panel.example.com/')).toEqual([
      'http://localhost:5173',
      'https://panel.example.com',
      ...TAURI_ORIGINS,
    ]);
  });

  it('no duplica un origen de Tauri ya configurado', () => {
    const origins = resolveCorsOrigins('tauri://localhost');
    expect(origins).toEqual(TAURI_ORIGINS);
  });
});
