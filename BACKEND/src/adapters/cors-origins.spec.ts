import { DEV_ORIGINS, resolveCorsOrigins, TAURI_ORIGINS } from './cors-origins';

describe('resolveCorsOrigins', () => {
  it('mantiene * fuera de producción', () => {
    expect(resolveCorsOrigins('*', 'development')).toBe('*');
  });

  it('ignora * en producción y deja solo los orígenes de Tauri', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveCorsOrigins('*', 'production')).toEqual(TAURI_ORIGINS);
    expect(resolveCorsOrigins('*,https://panel.example.com', 'production')).toEqual([
      'https://panel.example.com',
      ...TAURI_ORIGINS,
    ]);
  });

  it('sin CORS_ORIGIN en producción solo admite la app de escritorio', () => {
    expect(resolveCorsOrigins('', 'production')).toEqual(TAURI_ORIGINS);
  });

  it('en desarrollo añade el servidor de Vite', () => {
    expect(resolveCorsOrigins('', 'development')).toEqual([...TAURI_ORIGINS, ...DEV_ORIGINS]);
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
