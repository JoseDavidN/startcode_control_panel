import { EventEmitter } from 'events';
import { SSHService } from '@monitoring/services/ssh.service';
import { HostKeyMismatchError, HostKeyUnverifiedError } from '@monitoring/services/host-key';
import type { Server } from '@servers/entities/server.entity';

/* ssh2 falso: llama al hostVerifier con la clave que «presenta» el host y
   emite 'ready' o, si se rechaza, el error que da ssh2 en ese caso. */
let presentedKey: Buffer;
const connectSpy = jest.fn();
jest.mock('ssh2', () => ({
  Client: class extends EventEmitter {
    connect(cfg: { hostVerifier: (key: Buffer) => boolean }) {
      connectSpy(cfg);
      setImmediate(() => {
        if (cfg.hostVerifier(presentedKey)) this.emit('ready');
        else this.emit('error', new Error('Host denied (verification failed)'));
      });
    }
    end() {
      /* nada */
    }
  },
}));

const KEY_A = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIG+FP0YZEaUjAdGjK2sod8qE8rx3bA4tMW6IPtC4zzkM', 'base64');
const FP_A = 'SHA256:FOEznlvR3dc22Vo2GnaMi19lK9Z6GTSwCQlS0IH70wA';
const KEY_B = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIPZI1EN+ROpF0eEB3c2UKbGKZ4fhF4Gg5CpEMbEktqKh', 'base64');
const FP_B = 'SHA256:wBsg0trMaxDwxZWVC9V9Fiibvx3awLLCI8m5zH2y870';

const PRIVATE_KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----';

function server(over: Partial<Server> = {}): Server {
  return {
    id: 'srv-1',
    name: 'prueba',
    host: '10.0.0.1',
    port: 22,
    username: 'root',
    privateKey: PRIVATE_KEY,
    hostKeyAlgorithm: null,
    hostKeyFingerprint: null,
    hostKeyVerifiedAt: null,
    ...over,
  } as Server;
}

describe('SSHService · verificación de la clave de host', () => {
  let service: SSHService;

  beforeEach(() => {
    connectSpy.mockClear();
    service = new SSHService();
  });

  it('sin huella confirmada: corta antes de autenticarse y enseña la recibida', async () => {
    presentedKey = KEY_A;
    const err: unknown = await service.createDedicatedClient(server()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HostKeyUnverifiedError);
    expect((err as HostKeyUnverifiedError).getStatus()).toBe(409);
    expect((err as HostKeyUnverifiedError).details).toEqual({
      serverId: 'srv-1',
      host: '10.0.0.1',
      port: 22,
      expected: null,
      received: { algorithm: 'ssh-ed25519', fingerprint: FP_A },
    });
  });

  it('el pool (connect) tampoco acepta un host sin huella', async () => {
    presentedKey = KEY_A;
    await expect(service.connect(server())).rejects.toBeInstanceOf(HostKeyUnverifiedError);
  });

  it('coincide: conecta', async () => {
    presentedKey = KEY_A;
    await expect(service.createDedicatedClient(server({ hostKeyFingerprint: FP_A }))).resolves.toBeDefined();
  });

  it('no coincide: rechaza con HostKeyMismatchError y las dos huellas', async () => {
    presentedKey = KEY_B;
    const err: unknown = await service
      .createDedicatedClient(server({ hostKeyAlgorithm: 'ssh-ed25519', hostKeyFingerprint: FP_A }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HostKeyMismatchError);
    expect((err as HostKeyMismatchError).details).toEqual({
      serverId: 'srv-1',
      host: '10.0.0.1',
      port: 22,
      expected: { algorithm: 'ssh-ed25519', fingerprint: FP_A },
      received: { algorithm: 'ssh-ed25519', fingerprint: FP_B },
    });
  });

  it('el pool (connect) también verifica', async () => {
    presentedKey = KEY_B;
    await expect(service.connect(server({ hostKeyFingerprint: FP_A }))).rejects.toBeInstanceOf(HostKeyMismatchError);
  });

  it('probar conexión deja pasar el rechazo de clave, no lo convierte en «falló»', async () => {
    presentedKey = KEY_A;
    await expect(service.testConnection(server())).rejects.toBeInstanceOf(HostKeyUnverifiedError);
  });

  it('todas las conexiones pasan un hostVerifier', async () => {
    presentedKey = KEY_A;
    await service.createDedicatedClient(server({ hostKeyFingerprint: FP_A }));
    const [[cfg]] = connectSpy.mock.calls as [[{ hostVerifier?: unknown }]];
    expect(typeof cfg.hostVerifier).toBe('function');
  });
});
