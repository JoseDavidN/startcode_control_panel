import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
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
