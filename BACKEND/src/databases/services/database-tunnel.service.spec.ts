import { EventEmitter } from 'events';
import { connect, createServer, type Server as NetServer, type Socket } from 'net';
import type { AddressInfo } from 'net';
import { DatabaseTunnelService, type TunnelSpec } from '@/databases/services/database-tunnel.service';
import type { SSHService } from '@monitoring/services/ssh.service';

/* Cliente ssh2 falso: `forwardOut` abre un socket TCP directo al destino. */
class FakeClient extends EventEmitter {
  forwards: { host: string; port: number }[] = [];
  ended = false;
  forwardOut(_sh: string, _sp: number, host: string, port: number, cb: (err: Error | undefined, s: Socket) => void) {
    this.forwards.push({ host, port });
    const s = connect(port, host, () => cb(undefined, Object.assign(s, { close: () => s.end() })));
    s.on('error', err => cb(err, s));
  }
  end() {
    this.ended = true;
    this.emit('close');
  }
}

function roundTrip(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = connect(port, '127.0.0.1', () => s.write(text));
    s.on('data', d => { resolve(d.toString()); s.end(); });
    s.on('error', reject);
  });
}

describe('DatabaseTunnelService', () => {
  let echo: NetServer;
  let echoPort: number;
  let clients: FakeClient[];
  let service: DatabaseTunnelService;
  const openTunnelClient = jest.fn();

  beforeAll(async () => {
    echo = createServer(s => s.on('data', d => s.write(`eco:${d.toString()}`)));
    await new Promise<void>(r => echo.listen(0, '127.0.0.1', r));
    echoPort = (echo.address() as AddressInfo).port;
  });
  afterAll(() => new Promise(r => echo.close(r)));

  beforeEach(() => {
    clients = [];
    openTunnelClient.mockReset();
    openTunnelClient.mockImplementation(() => {
      const c = new FakeClient();
      clients.push(c);
      return Promise.resolve(c);
    });
    service = new DatabaseTunnelService({ openTunnelClient } as unknown as SSHService);
  });
  afterEach(() => service.onModuleDestroy());

  const spec = (): TunnelSpec => ({
    ssh: { host: 'bastion', port: 22, username: 'u', password: 'p', hostKeyFingerprint: 'SHA256:x' },
    dstHost: '127.0.0.1',
    dstPort: echoPort,
  });

  it('reenvía el tráfico al destino por el cliente SSH', async () => {
    const ep = await service.acquire(spec());
    expect(ep.host).toBe('127.0.0.1');
    expect(ep.port).not.toBe(echoPort);
    await expect(roundTrip(ep.port, 'hola')).resolves.toBe('eco:hola');
    expect(clients[0].forwards).toEqual([{ host: '127.0.0.1', port: echoPort }]);
  });

  it('reutiliza el túnel con los mismos datos y abre otro con credenciales distintas', async () => {
    const [a, b] = await Promise.all([service.acquire(spec()), service.acquire(spec())]);
    expect(a.port).toBe(b.port);
    expect(openTunnelClient).toHaveBeenCalledTimes(1);
    const other = spec();
    other.ssh.password = 'otra';
    await service.acquire(other);
    expect(openTunnelClient).toHaveBeenCalledTimes(2);
  });

  it('si el cliente SSH se cierra, la siguiente llamada abre uno nuevo', async () => {
    const first = await service.acquire(spec());
    clients[0].end();
    const second = await service.acquire(spec());
    expect(openTunnelClient).toHaveBeenCalledTimes(2);
    expect(second.port).not.toBe(first.port);
  });

  it('traduce el fallo de autenticación y no deja el túnel en caché', async () => {
    openTunnelClient.mockRejectedValueOnce(Object.assign(new Error('All configured authentication methods failed'), { level: 'client-authentication' }));
    await expect(service.acquire(spec())).rejects.toThrow(/túnel SSH: usuario, contraseña o llave SSH incorrectos/);
    await expect(service.acquire(spec())).resolves.toMatchObject({ host: '127.0.0.1' });
  });
});
