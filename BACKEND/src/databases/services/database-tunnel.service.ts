import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import { createServer, type AddressInfo, type Server as NetServer, type Socket } from 'net';
import type { Client } from 'ssh2';
import { SSHService, type SSHTarget } from '@monitoring/services/ssh.service';
import { HostKeyError } from '@monitoring/services/host-key';

/** Servidor SSH y destino del motor visto desde él. */
export interface TunnelSpec {
  ssh: SSHTarget;
  dstHost: string;
  dstPort: number;
}

export interface TunnelEndpoint {
  host: string;
  port: number;
}

/** Sin conexiones pasando por él durante este tiempo, el túnel se cierra. */
const IDLE_MS = 60_000;

interface Tunnel {
  client: Client;
  server: NetServer;
  port: number;
  sockets: Set<Socket>;
  idle: NodeJS.Timeout | null;
  closed: boolean;
}

interface Entry {
  key: string;
  tunnel: Promise<Tunnel>;
}

/**
 * Túneles SSH de las conexiones a bases de datos. Cada túnel es un cliente
 * ssh2 más un puerto local en 127.0.0.1: los drivers (pg, mysql2, ioredis)
 * se conectan a ese puerto como a un motor cualquiera y cada socket se
 * reenvía al motor por el canal SSH (`forwardOut`).
 *
 * Se comparten por datos de túnel (servidor, credenciales, huella y
 * destino): la vista de consultas, el árbol y las pruebas reutilizan el mismo
 * mientras haya tráfico, y se cierra solo tras un minuto sin conexiones.
 */
@Injectable()
export class DatabaseTunnelService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseTunnelService.name);
  private readonly entries = new Map<string, Entry>();

  constructor(@Inject(forwardRef(() => SSHService)) private readonly ssh: SSHService) {}

  async onModuleDestroy() {
    const tunnels = await Promise.allSettled([...this.entries.values()].map(e => e.tunnel));
    for (const t of tunnels) if (t.status === 'fulfilled') this.dispose(t.value);
    this.entries.clear();
  }

  /** Abre el túnel (o reutiliza el abierto) y devuelve su boca local. */
  async acquire(spec: TunnelSpec): Promise<TunnelEndpoint> {
    const key = tunnelKey(spec);
    let entry = this.entries.get(key);
    if (!entry) {
      const created: Entry = { key, tunnel: Promise.resolve(null as unknown as Tunnel) };
      created.tunnel = this.open(spec, created);
      created.tunnel.catch(() => { if (this.entries.get(key) === created) this.entries.delete(key); });
      this.entries.set(key, created);
      entry = created;
    }
    const tunnel = await entry.tunnel;
    /* Si nadie llega a conectarse, el temporizador lo cierra igual. */
    if (!tunnel.sockets.size) this.scheduleIdle(tunnel, entry);
    return { host: '127.0.0.1', port: tunnel.port };
  }

  private async open(spec: TunnelSpec, entry: Entry): Promise<Tunnel> {
    let client: Client;
    try {
      client = await this.ssh.openTunnelClient(spec.ssh);
    } catch (err) {
      throw tunnelError(err);
    }

    const tunnel: Tunnel = { client, server: createServer(), port: 0, sockets: new Set(), idle: null, closed: false };
    tunnel.server.on('connection', socket => this.forward(tunnel, entry, spec, socket));
    tunnel.server.on('error', () => this.close(tunnel, entry));
    client.on('close', () => this.close(tunnel, entry));

    try {
      await new Promise<void>((resolve, reject) => {
        tunnel.server.once('error', reject);
        /* Solo en loopback: el puerto no se ofrece fuera del panel. */
        tunnel.server.listen(0, '127.0.0.1', () => resolve());
      });
    } catch (err) {
      this.dispose(tunnel);
      throw err;
    }
    tunnel.port = (tunnel.server.address() as AddressInfo).port;
    this.logger.debug(`Túnel SSH a ${spec.ssh.host} abierto en 127.0.0.1:${tunnel.port}`);
    return tunnel;
  }

  private forward(tunnel: Tunnel, entry: Entry, spec: TunnelSpec, socket: Socket) {
    tunnel.sockets.add(socket);
    this.clearIdle(tunnel);
    socket.on('error', () => undefined);
    socket.on('close', () => {
      tunnel.sockets.delete(socket);
      if (!tunnel.sockets.size) this.scheduleIdle(tunnel, entry);
    });
    tunnel.client.forwardOut('127.0.0.1', socket.remotePort ?? 0, spec.dstHost, spec.dstPort, (err, stream) => {
      /* El servidor SSH no deja reenviar o el motor no escucha ahí: el
         driver ve la conexión cerrada y da su error de conexión. */
      if (err) {
        this.logger.debug(`Túnel SSH: no se pudo reenviar a ${spec.dstHost}:${spec.dstPort}: ${err.message}`);
        socket.destroy();
        return;
      }
      if (socket.destroyed) {
        stream.close();
        return;
      }
      stream.on('error', () => socket.destroy());
      stream.on('close', () => socket.destroy());
      socket.on('close', () => stream.close());
      socket.pipe(stream).pipe(socket);
    });
  }

  private scheduleIdle(tunnel: Tunnel, entry: Entry) {
    this.clearIdle(tunnel);
    tunnel.idle = setTimeout(() => this.close(tunnel, entry), IDLE_MS);
    tunnel.idle.unref();
  }

  private clearIdle(tunnel: Tunnel) {
    if (tunnel.idle) clearTimeout(tunnel.idle);
    tunnel.idle = null;
  }

  private close(tunnel: Tunnel, entry: Entry) {
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    this.dispose(tunnel);
  }

  private dispose(tunnel: Tunnel) {
    if (tunnel.closed) return;
    tunnel.closed = true;
    this.clearIdle(tunnel);
    for (const s of tunnel.sockets) s.destroy();
    tunnel.sockets.clear();
    tunnel.server.close();
    try {
      tunnel.client.end();
    } catch {
      /* ya cerrado */
    }
  }
}

/* La clave lleva las credenciales: va como hash para no guardarlas en claro en el mapa. */
function tunnelKey(spec: TunnelSpec): string {
  const { ssh } = spec;
  return createHash('sha256')
    .update(JSON.stringify([
      ssh.host, ssh.port, ssh.username, ssh.privateKey ?? '', ssh.password ?? '',
      ssh.hostKeyFingerprint ?? '', spec.dstHost, spec.dstPort,
    ]))
    .digest('hex');
}

/** Errores de ssh2 al abrir el túnel, en un mensaje para el usuario. La huella se deja tal cual (409 tipado). */
function tunnelError(err: unknown): Error {
  if (err instanceof HostKeyError) return err;
  const e = err as { code?: string; level?: string; message?: string };
  const msg = e?.message ?? String(err);
  let reason = msg;
  if (e?.level === 'client-authentication' || /authentication methods failed/i.test(msg)) {
    reason = 'usuario, contraseña o llave SSH incorrectos';
  } else if (e?.code === 'ECONNREFUSED') {
    reason = 'el servidor SSH rechazó la conexión (host o puerto)';
  } else if (e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN') {
    reason = 'no se encontró el host SSH';
  } else if (e?.code === 'ETIMEDOUT' || /timeout/i.test(msg)) {
    reason = 'tiempo de espera agotado al conectar al servidor SSH';
  } else if (/privateKey|parse|BEGIN/i.test(msg)) {
    reason = 'la llave privada SSH no es válida o tiene frase de paso';
  }
  return Object.assign(new Error(`No se pudo abrir el túnel SSH: ${reason}`), { code: 'ESSHTUNNEL' });
}
