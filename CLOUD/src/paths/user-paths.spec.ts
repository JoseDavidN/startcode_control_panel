import { assignMissingPaths, overlaps, personalPaths } from './user-paths';

describe('user-paths', () => {
  const legacy = { home: '/srv/cloud/home', backups: '/srv/cloud/backups' };
  const root = '/srv/cloud';

  it('overlaps: misma carpeta, dentro o por encima; no prefijos de nombre', () => {
    expect(overlaps('/a/b', '/a/b')).toBe(true);
    expect(overlaps('/a/b/c', '/a/b')).toBe(true);
    expect(overlaps('/a', '/a/b')).toBe(true);
    expect(overlaps('/a/bc', '/a/b')).toBe(false);
  });

  it('carpeta personal en minúsculas dentro de users', () => {
    expect(personalPaths(root, 'Bob')).toEqual({ home: '/srv/cloud/users/bob/home', backups: '/srv/cloud/users/bob/backups' });
  });

  it('sin rutas de nadie: el más antiguo conserva las de antes y el resto recibe la suya', () => {
    const result = assignMissingPaths([
      { username: 'eve', createdAt: '2026-02-01T00:00:00Z' },
      { username: 'admin', createdAt: '2026-01-01T00:00:00Z' },
    ], legacy, root);
    expect(result.get('admin')).toEqual(legacy);
    expect(result.get('eve')).toEqual(personalPaths(root, 'eve'));
  });

  it('si alguien ya tiene rutas, un usuario nuevo nunca hereda las compartidas de antes', () => {
    const result = assignMissingPaths([
      { username: 'admin', createdAt: '2026-01-01T00:00:00Z', paths: { home: '/srv/cloud/mio', backups: '/srv/cloud/copias' } },
      { username: 'bob', createdAt: '2026-03-01T00:00:00Z' },
    ], legacy, root);
    expect(result.get('bob')).toEqual(personalPaths(root, 'bob'));
    expect(result.has('admin')).toBe(false);
  });

  it('no asigna nada que se solape con la carpeta de otro', () => {
    const result = assignMissingPaths([
      { username: 'eve', createdAt: '2026-01-01T00:00:00Z', paths: { home: '/srv/cloud/users', backups: '/srv/cloud/b' } },
      { username: 'bob', createdAt: '2026-03-01T00:00:00Z' },
    ], legacy, root);
    expect(result.has('bob')).toBe(false);
  });

  it('las de antes no se usan si contienen la carpeta users', () => {
    const result = assignMissingPaths([{ username: 'admin', createdAt: '2026-01-01T00:00:00Z' }], { home: '/srv/cloud', backups: '/srv/b' }, root);
    expect(result.get('admin')).toEqual(personalPaths(root, 'admin'));
  });
});
