import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Readable, Writable } from 'stream';
import type { SftpSession } from '../sftp.types';
import { MAX_MKDIRP_DIRS, SftpOperationsService } from './sftp-operations.service';

const config = (value: unknown) => ({ get: jest.fn().mockReturnValue(value) }) as unknown as ConfigService;

/* Sesión sin canales reales: si el servicio llega a tocarlos, el test lo ve. */
const channel = () => ({ mkdir: jest.fn(), stat: jest.fn(), lstat: jest.fn(), createWriteStream: jest.fn() });
const session = (data = channel()) =>
  ({ home: '/home/deploy', ensuredDirs: new Set<string>(), meta: channel(), data }) as unknown as SftpSession;

describe('SftpOperationsService: límites', () => {
  it.each(['abc', 0, -5, 'NaN'])('un límite mal configurado (%j) vuelve al de por defecto, no a «sin límite»', async value => {
    const ops = new SftpOperationsService(config(value));
    const data = channel();
    const s = session(data);
    await expect(
      ops.uploadStream(s, { destDir: '/srv', relPath: 'a.bin', source: Readable.from([]), overwrite: false, declaredSize: 3 * 1024 ** 3 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(data.lstat).not.toHaveBeenCalled();
  });

  it('rechaza por Content-Length antes de abrir nada en el servidor', async () => {
    const ops = new SftpOperationsService(config(1024));
    const data = channel();
    const s = session(data);
    const source = Object.assign(Readable.from([]), { headers: { 'content-length': '2048' } });
    await expect(ops.uploadStream(s, { destDir: '/srv', relPath: 'a.bin', source, overwrite: false })).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    expect(data.createWriteStream).not.toHaveBeenCalled();
  });

  it('mkdirp acota el número de carpetas y exige una lista', async () => {
    const ops = new SftpOperationsService(config(1024));
    const dirs = Array.from({ length: MAX_MKDIRP_DIRS + 1 }, (_, i) => `d${i}`);
    await expect(ops.mkdirp(session(), '/srv', dirs)).rejects.toBeInstanceOf(BadRequestException);
    await expect(ops.mkdirp(session(), '/srv', 'x' as unknown as string[])).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SftpOperationsService: subida por partes', () => {
  const partSession = (data: Record<string, jest.Mock>) =>
    ({
      home: '/home/deploy',
      ensuredDirs: new Set<string>(['/srv']),
      partials: new Map<string, number>(),
      activeUploads: 0,
      meta: channel(),
      data,
    }) as unknown as SftpSession;

  it('no continúa un archivo que la sesión no empezó', async () => {
    const ops = new SftpOperationsService(config(1024 ** 3));
    const data = channel();
    const s = partSession(data);
    await expect(
      ops.uploadStream(s, { destDir: '/srv', relPath: 'a.bin', source: Readable.from([]), overwrite: false, offset: 10, total: 20, declaredSize: 10 }),
    ).rejects.toThrow('no se puede continuar');
    expect(data.createWriteStream).not.toHaveBeenCalled();
  });

  it('no continúa desde otra posición que la confirmada', async () => {
    const ops = new SftpOperationsService(config(1024 ** 3));
    const data = channel();
    const s = partSession(data);
    s.partials.set('/srv/a.bin', 8);
    await expect(
      ops.uploadStream(s, { destDir: '/srv', relPath: 'a.bin', source: Readable.from([]), overwrite: false, offset: 10, total: 20, declaredSize: 10 }),
    ).rejects.toThrow('no se puede continuar');
  });

  it('rechaza un total por encima del límite antes de abrir nada', async () => {
    const ops = new SftpOperationsService(config(1024));
    const data = channel();
    const s = partSession(data);
    await expect(
      ops.uploadStream(s, { destDir: '/srv', relPath: 'a.bin', source: Readable.from([]), overwrite: false, offset: 0, total: 4096, declaredSize: 512 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(data.lstat).not.toHaveBeenCalled();
  });

  it('solo descarta archivos a medias de la propia sesión', async () => {
    const ops = new SftpOperationsService(config(1024));
    const data = { ...channel(), unlink: jest.fn((_p: string, cb: (e: null) => void) => cb(null)) };
    const s = partSession(data);
    await expect(ops.discardPartial(s, '/srv', 'otro.bin')).resolves.toBe(false);
    expect(data.unlink).not.toHaveBeenCalled();

    s.partials.set('/srv/a.bin', 8);
    await expect(ops.discardPartial(s, '/srv', 'a.bin')).resolves.toBe(true);
    expect(data.unlink).toHaveBeenCalledWith('/srv/a.bin', expect.any(Function));
    expect(s.partials.size).toBe(0);
  });
});

describe('SftpOperationsService: descarga', () => {
  const statsOf = (kind: 'file' | 'dir' | 'fifo', size = 0) => ({
    size,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
  });
  const withStat = (stats: unknown) => {
    const meta = { stat: jest.fn((_p: string, cb: (e: null, s: unknown) => void) => cb(null, stats)) };
    return { home: '/home/deploy', meta, data: { open: jest.fn() }, activeDownloads: 0 } as unknown as SftpSession;
  };

  it('distingue archivo y carpeta, y la raíz tiene nombre', async () => {
    const ops = new SftpOperationsService(config(1024));
    await expect(ops.downloadInfo(withStat(statsOf('file', 5)), '/srv/a.txt')).resolves.toMatchObject({ kind: 'file', name: 'a.txt', size: 5 });
    await expect(ops.downloadInfo(withStat(statsOf('dir')), '/')).resolves.toMatchObject({ kind: 'dir', name: 'raiz' });
  });

  it('rechaza lo que no es archivo ni carpeta antes de abrir nada: leer una tubería no acaba', async () => {
    const ops = new SftpOperationsService(config(1024));
    const s = withStat(statsOf('fifo'));
    const res = Object.assign(new Writable(), { setHeader: jest.fn() });
    await expect(ops.download(s, '/srv/pipe', res)).rejects.toBeInstanceOf(BadRequestException);
    expect((s.data as unknown as { open: jest.Mock }).open).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(s.activeDownloads).toBe(0);
  });
});
