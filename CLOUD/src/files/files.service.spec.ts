import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import type { CloudConfig } from '@/common/cloud-config';
import type { PathsService } from '@/paths/paths.service';
import { isStreamable } from './file-types';
import { FilesService } from './files.service';
import { listFiles } from './tree';

/** Cuerpo de una subida como lo ve el servicio (la petición de Express). */
const body = (data: string, headers: Record<string, string> = { 'content-type': 'application/octet-stream' }) =>
  Object.assign(Readable.from([Buffer.from(data)]), { headers, complete: true });

describe('FilesService', () => {
  let base: string;
  let service: FilesService;
  const paths = (user: string) => ({ home: join(base, 'storage', user, 'home'), backups: join(base, 'storage', user, 'backups') });

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'cloud-files-'));
    const config = { allowedRoots: [join(base, 'storage')], maxUploadBytes: 1024, treeMaxEntries: 100 } as unknown as CloudConfig;
    service = new FilesService(config, { get: paths } as unknown as PathsService);
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('cada usuario ve solo su carpeta', async () => {
    await service.upload('bob', 'home', '', 'secreto.txt', 3, body('abc'));
    await expect(service.content('eve', 'home', 'secreto.txt')).rejects.toMatchObject({ status: 404 });
    expect(JSON.stringify(await service.tree('eve', 'home'))).not.toContain('secreto');
  });

  it('rechaza una subida que no es application/octet-stream sin pisar el archivo', async () => {
    await service.upload('bob', 'home', '', 'a.txt', 3, body('abc'));
    await expect(service.upload('bob', 'home', '', 'a.txt', undefined, body('', { 'content-type': 'application/json' })))
      .rejects.toMatchObject({ status: 415 });
    expect(await readFile(join(paths('bob').home, 'a.txt'), 'utf8')).toBe('abc');
  });

  it('rechaza por tamaño declarado o real y no deja temporales', async () => {
    await expect(service.upload('bob', 'home', '', 'g.bin', 5000, body('x'))).rejects.toMatchObject({ status: 413 });
    await expect(service.upload('bob', 'home', '', 'g.bin', undefined, body('x', { 'content-length': '5000' }))).rejects.toMatchObject({ status: 413 });
    await expect(service.upload('bob', 'home', '', 'g.bin', undefined, body('x'.repeat(2000)))).rejects.toMatchObject({ status: 413 });
    await expect(service.upload('bob', 'home', '', 'g.bin', 10, body('x'))).rejects.toMatchObject({ status: 400 });
    expect(await readdir(paths('bob').home)).toEqual([]);
  });

  it('no sigue enlaces simbólicos al subir, leer, mover ni crear carpetas', async () => {
    await mkdir(paths('bob').home, { recursive: true });
    await mkdir(paths('eve').home, { recursive: true });
    await writeFile(join(paths('eve').home, 'de-eve.txt'), 'eve');
    await symlink(paths('eve').home, join(paths('bob').home, 'puente'));
    await expect(service.content('bob', 'home', 'puente/de-eve.txt')).rejects.toMatchObject({ status: 403 });
    await expect(service.upload('bob', 'home', 'puente', 'x.txt', 1, body('x'))).rejects.toMatchObject({ status: 403 });
    await expect(service.createFolder('bob', 'home', 'puente', 'nueva')).rejects.toMatchObject({ status: 403 });
    await service.upload('bob', 'home', '', 'mio.txt', 1, body('m'));
    await expect(service.move('bob', 'home', 'mio.txt', 'home', 'puente')).rejects.toMatchObject({ status: 403 });
    expect(await readdir(paths('eve').home)).toEqual(['de-eve.txt']);
  });

  it('una raíz de sección enlazada fuera de las carpetas permitidas no se usa', async () => {
    await mkdir(join(base, 'fuera'), { recursive: true });
    await mkdir(join(base, 'storage', 'mal'), { recursive: true });
    await symlink(join(base, 'fuera'), paths('mal').home);
    await expect(service.tree('mal', 'home')).rejects.toMatchObject({ status: 403 });
  });

  it('renombrar solo en mayúsculas no pisa otro archivo distinto', async () => {
    await service.upload('bob', 'home', '', 'a.txt', 1, body('a'));
    await service.upload('bob', 'home', '', 'A.txt', 1, body('B'));
    await expect(service.rename('bob', 'home', 'a.txt', 'A.txt')).rejects.toMatchObject({ status: 409 });
    expect(await readFile(join(paths('bob').home, 'A.txt'), 'utf8')).toBe('B');
  });

  it('dos árboles pedidos a la vez comparten el recorrido', async () => {
    const [a, b] = [service.tree('bob', 'home'), service.tree('bob', 'home')];
    expect(a).toBe(b);
    await a;
    expect(service.tree('bob', 'home')).not.toBe(a);
  });

  it('el zip se niega con más elementos del tope', async () => {
    const dir = join(base, 'muchos');
    await mkdir(dir);
    await Promise.all(Array.from({ length: 5 }, (_, i) => writeFile(join(dir, `${i}.txt`), 'x')));
    await expect(listFiles(dir, 'muchos', 4)).rejects.toMatchObject({ status: 413 });
    expect(await listFiles(dir, 'muchos', 5)).toHaveLength(5);
  });

  it('solo video y audio se sirven por ticket', () => {
    expect(isStreamable('peli.mkv')).toBe(true);
    expect(isStreamable('Música/tema.mp3')).toBe(true);
    expect(isStreamable('dibujo.svg')).toBe(false);
    expect(isStreamable('pagina.html')).toBe(false);
  });
});
