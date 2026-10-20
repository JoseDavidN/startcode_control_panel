// src/monitoring/services/ssh.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Client } from 'ssh2';
import type { ConnectConfig } from 'ssh2';
import { Server } from '@servers/entities/server.entity';
import { isValidHost, isValidPort } from '@/common/security/network';
import {
  createHostKeyGuard,
  HostKeyMismatchError,
  type HostKey,
  type HostKeyGuard,
} from '@monitoring/services/host-key';

export interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
  /** La salida superó `maxOutputBytes` y se recortó. */
  truncated?: boolean;
}

/** Lo justo para abrir una conexión: un servidor guardado o uno que aún no lo está. */
export type SSHTarget = Pick<Server, 'host' | 'port' | 'username' | 'privateKey'> &
  Partial<Pick<Server, 'id' | 'name' | 'hostKeyAlgorithm' | 'hostKeyFingerprint'>>;

const CONNECT_TIMEOUT_MS = 15000;

@Injectable()
export class SSHService {
  private readonly logger = new Logger(SSHService.name);
  private connections: Map<string, Client> = new Map();

  constructor(
    @InjectRepository(Server)
    private readonly servers: Repository<Server>,
  ) {}

  /**
   * Conectar a un servidor SSH
   * @param server - El servidor a conectar
   * @returns La conexión SSH
   */
  async connect(server: Server): Promise<Client> {
    // SIEMPRE crear nueva conexión para evitar problemas de canales
    // Eliminar conexión previa si existe
    const oldConn = this.connections.get(server.id);
    if (oldConn) {
      try {
        oldConn.end();
      } catch {
        // Ignorar errores al cerrar
      }
      this.connections.delete(server.id);
    }

    this.logger.debug(
      `🔗 Creando nueva conexión a ${server.host}:${server.port} como ${server.username}`,
    );

    const { conn } = await this.open(server);
    this.connections.set(server.id, conn);
    this.logger.log(`✅ Conectado exitosamente a ${server.name}`);
    conn.on('close', () => {
      if (this.connections.get(server.id) === conn) this.connections.delete(server.id);
      this.logger.debug(`Conexión cerrada: ${server.name}`);
    });
    return conn;
  }

  /**
   * Cliente SSH dedicado, fuera del pool. Lo usa la terminal interactiva: el
   * pool se recicla en cada `connect()`, así que compartirlo cortaría la sesión
   * del usuario cada vez que el monitoreo ejecuta un comando (y al revés).
   */
  async createDedicatedClient(server: Server): Promise<Client> {
    const { conn } = await this.open(server);
    this.logger.log(`🖥️  Terminal SSH abierta en ${server.name}`);
    return conn;
  }

  /**
   * Única puerta de entrada de las conexiones ssh2 del panel: todas pasan por
   * el `hostVerifier` (TOFU). La primera vez se acepta la clave y se guarda al
   * quedar autenticada la sesión; si no coincide con la guardada, ssh2 corta
   * el intercambio antes de autenticarse y se lanza `HostKeyMismatchError`.
   *
   * Un objetivo sin `id` (prueba antes de guardar el servidor) acepta la clave
   * sin guardarla y la devuelve para que el usuario la vea.
   */
  private open(target: SSHTarget): Promise<{ conn: Client; hostKey: HostKey }> {
    return new Promise((resolve, reject) => {
      const options = this.connectOptions(target);
      const guard = createHostKeyGuard(target.hostKeyFingerprint);
      const conn = new Client();
      let settled = false;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          conn.end();
        } catch {
          /* ya cerrada */
        }
        reject(err);
      };

      const timeout = setTimeout(
        () => fail(new Error('Timeout de conexión SSH (15 segundos)')),
        CONNECT_TIMEOUT_MS,
      );

      conn.on('ready', () => {
        this.confirmHostKey(target, guard).then(
          (hostKey) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve({ conn, hostKey });
          },
          (err: unknown) => fail(err instanceof Error ? err : new Error(String(err))),
        );
      });

      /* El listener se queda: ssh2 emite 'error' también después de 'ready'
         (keepalive) y sin nadie escuchando tumbaría el proceso. */
      conn.on('error', (err) => {
        const mismatch = this.mismatchError(target, guard);
        if (!settled) {
          this.logger.error(`❌ Error SSH en ${target.name ?? target.host}: ${mismatch?.message ?? err.message}`);
        }
        fail(mismatch ?? err);
      });

      conn.connect({ ...options, hostVerifier: guard.verifier });
    });
  }

  /** La clave ya pasó el verificador: en el primer uso, se fija. */
  private async confirmHostKey(target: SSHTarget, guard: HostKeyGuard): Promise<HostKey> {
    const received = guard.received();
    if (!received || !guard.result()) {
      throw new Error('El servidor SSH no presentó una clave de host verificable');
    }
    if (guard.result() !== 'first-use' || !target.id) return received;

    const now = new Date();
    /* Solo si sigue sin huella: dos primeras conexiones a la vez no se pisan. */
    const written = await this.servers.update(
      { id: target.id, hostKeyFingerprint: IsNull() },
      { hostKeyAlgorithm: received.algorithm, hostKeyFingerprint: received.fingerprint, hostKeyVerifiedAt: now },
    );
    if (!written.affected) {
      const stored = await this.servers.findOne({
        where: { id: target.id },
        select: ['id', 'hostKeyAlgorithm', 'hostKeyFingerprint'],
      });
      if (stored?.hostKeyFingerprint && stored.hostKeyFingerprint !== received.fingerprint) {
        throw new HostKeyMismatchError({
          serverId: target.id,
          host: target.host,
          port: target.port ?? 22,
          expected: { algorithm: stored.hostKeyAlgorithm, fingerprint: stored.hostKeyFingerprint },
          received,
        });
      }
      return received;
    }

    this.logger.log(`🔑 Clave de host fijada para ${target.name ?? target.host}: ${received.algorithm} ${received.fingerprint}`);
    Object.assign(target, {
      hostKeyAlgorithm: received.algorithm,
      hostKeyFingerprint: received.fingerprint,
      hostKeyVerifiedAt: now,
    });
    return received;
  }

  private mismatchError(target: SSHTarget, guard: HostKeyGuard): HostKeyMismatchError | null {
    const received = guard.received();
    if (guard.result() !== 'mismatch' || !received || !target.hostKeyFingerprint) return null;
    return new HostKeyMismatchError({
      serverId: target.id ?? '',
      host: target.host,
      port: target.port ?? 22,
      expected: { algorithm: target.hostKeyAlgorithm ?? null, fingerprint: target.hostKeyFingerprint },
      received,
    });
  }

  /**
   * Lee la clave de host que presenta ahora el servidor sin autenticarse: se
   * espera al fin del intercambio de claves (la firma del host ya se comprobó,
   * así que quien responde tiene la clave privada) y se corta antes de enviar
   * credenciales. Lo usa «aceptar nueva huella».
   */
  probeHostKey(target: Pick<Server, 'host' | 'port' | 'username'>): Promise<HostKey> {
    return new Promise((resolve, reject) => {
      if (!isValidHost(target.host) || !isValidPort(target.port ?? 22)) {
        reject(new BadRequestException('El host o el puerto SSH del servidor no son válidos: corrígelos en la configuración del servidor'));
        return;
      }
      const guard = createHostKeyGuard(null);
      const conn = new Client();
      let settled = false;
      const finish = (err: Error | null, key?: HostKey) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          conn.end();
        } catch {
          /* ya cerrada */
        }
        if (err) reject(err);
        else resolve(key!);
      };
      const timeout = setTimeout(
        () => finish(new Error('Timeout de conexión SSH (15 segundos)')),
        CONNECT_TIMEOUT_MS,
      );

      conn.on('handshake', () => {
        const key = guard.received();
        finish(key ? null : new Error('El servidor SSH no presentó una clave de host'), key ?? undefined);
      });
      conn.on('error', (err) => finish(err));
      conn.on('close', () => finish(new Error('El servidor SSH cerró la conexión antes de presentar su clave')));

      conn.connect({
        host: target.host,
        port: target.port,
        username: target.username,
        readyTimeout: CONNECT_TIMEOUT_MS,
        algorithms: this.algorithms(),
        hostVerifier: guard.verifier,
      });
    });
  }

  /**
   * Desconectar de un servidor
   * @param serverId - El ID del servidor a desconectar
   * @returns void
   */
  disconnect(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId);
    if (conn) {
      try {
        conn.end();
        this.logger.debug(`🔌 Desconectando del servidor ${serverId}`);
      } catch (error) {
        this.logger.warn(`Error al desconectar ${serverId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      this.connections.delete(serverId);
    }
    return Promise.resolve();
  }

  /**
   * Ejecutar comando en el servidor
   * @param server - El servidor a ejecutar el comando
   * @param command - El comando a ejecutar
   * @returns El resultado del comando
   */
  /**
   * Ejecuta sobre un cliente ya abierto (el de `createDedicatedClient`), sin
   * tocar el pool.
   *
   * Hace falta porque `executeCommand` abre una conexión nueva por comando —y
   * de paso mata la anterior de ese servidor—, así que una secuencia de
   * instalación no puede usarlo. Además cada `exec` es una shell distinta: lo
   * que necesite compartir estado tiene que ir en una sola llamada.
   *
   * `input` se escribe en stdin y se cierra; `onStdout` recibe la salida a
   * medida que llega, que es lo que permite ir pintando el progreso.
   */
  execOnClient(
    conn: Client,
    command: string,
    opts: {
      input?: string;
      timeoutMs?: number;
      onStdout?: (chunk: string) => void;
      /** Tope de stdout + stderr guardados; lo que pase se descarta. */
      maxOutputBytes?: number;
    } = {},
  ): Promise<SSHExecResult> {
    const timeoutMs = opts.timeoutMs ?? 30000;
    const maxBytes = opts.maxOutputBytes ?? Infinity;

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let size = 0;
      let truncated = false;
      let settled = false;

      /* Sin tope, un `cat` de un log de gigas se quedaba entero en memoria. */
      const keep = (chunk: string): string => {
        if (size >= maxBytes) {
          truncated = true;
          return '';
        }
        size += chunk.length;
        if (size <= maxBytes) return chunk;
        truncated = true;
        return chunk.slice(0, chunk.length - (size - maxBytes));
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new Error(`Timeout ejecutando el comando remoto (${Math.round(timeoutMs / 1000)} s)`),
        );
      }, timeoutMs);

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          if (!settled) {
            settled = true;
            reject(err);
          }
          return;
        }

        stream
          .on('close', (code: number) => {
            clearTimeout(timeout);
            if (settled) return;
            settled = true;
            resolve({ stdout, stderr, code: code ?? 0, truncated });
          })
          .on('data', (data: Buffer) => {
            const chunk = data.toString();
            stdout += keep(chunk);
            opts.onStdout?.(chunk);
          })
          .on('error', (streamError: Error) => {
            clearTimeout(timeout);
            if (settled) return;
            settled = true;
            reject(streamError);
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += keep(data.toString());
          });

        if (opts.input !== undefined) stream.end(opts.input);
      });
    });
  }

  async executeCommand(
    server: Server,
    command: string,
  ): Promise<SSHExecResult> {
    const conn = await this.connect(server);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        reject(new Error('Timeout ejecutando comando (30 segundos)'));
      }, 30000);

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          this.logger.error(`Error ejecutando comando: ${err.message}`);
          return reject(err);
        }

        stream
          .on('close', (code: number) => {
            clearTimeout(timeout);
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              code: code || 0,
            });
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .on('error', (err: Error) => {
            clearTimeout(timeout);
            reject(err);
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  /**
   * Ejecutar múltiples comandos (secuencial con delays)
   * @param server - El servidor a ejecutar los comandos
   * @param commands - Los comandos a ejecutar
   * @returns Los resultados de los comandos
   */
  async executeCommands(
    server: Server,
    commands: string[],
  ): Promise<SSHExecResult[]> {
    const results: SSHExecResult[] = [];

    for (const command of commands) {
      try {
        const result = await this.executeCommand(server, command);
        results.push(result);
        // Pequeño delay entre comandos para evitar saturar el canal
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error en comando "${command}": ${message}`);
        results.push({
          stdout: '',
          stderr: message,
          code: 1,
        });

        // delay incluso en errores
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  /**
   * Verificar si el servidor está accesible
   * @param server - El servidor a testear la conexión
   * @returns true si la conexión es exitosa, false en caso contrario
   */
  async testConnection(server: SSHTarget): Promise<{ ok: boolean; hostKey: HostKey | null }> {
    /* Con un servidor aún sin guardar (sin id) la clave se acepta sin fijarla:
       se devuelve para que el usuario la vea y se guarda al crear el servidor. */
    let conn: Client | null = null;
    try {
      const opened = await this.open(server);
      conn = opened.conn;
      const result = await this.execOnClient(conn, 'echo "test"', { timeoutMs: 10000 });
      return { ok: result.code === 0 && result.stdout.trim() === 'test', hostKey: opened.hostKey };
    } catch (error) {
      if (error instanceof HostKeyMismatchError) throw error;
      this.logger.error(`Test de conexión falló: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, hostKey: null };
    } finally {
      conn?.end();
    }
  }

  /**
   * Cerrar todas las conexiones
   * @returns void
   */
  disconnectAll(): void {
    this.connections.forEach((conn, serverId) => {
      conn.end();
      this.logger.log(`Desconectado del servidor ${serverId}`);
    });
    this.connections.clear();
  }

  /**
   * Obtener conexiones activas
   * @returns El número de conexiones activas
   */
  getActiveConnections(): number {
    return this.connections.size;
  }

  /**
   * Limpiar y normalizar la llave privada
   * @param privateKey - La llave privada a limpiar
   * @returns La llave privada limpia
   */
  /** Opciones de conexión compartidas por el pool y por la terminal. */
  private connectOptions(server: SSHTarget): ConnectConfig {
    /* Un host o puerto guardado antes de validar los DTO no debe llegar a ssh2:
       con un puerto fuera de rango lanza un RangeError desde un socket. */
    if (!isValidHost(server.host) || !isValidPort(server.port ?? 22)) {
      throw new BadRequestException('El host o el puerto SSH del servidor no son válidos: corrígelos en la configuración del servidor');
    }
    return {
      host: server.host,
      port: server.port,
      username: server.username,
      privateKey: Buffer.from(this.cleanPrivateKey(server.privateKey), 'utf8'),
      readyTimeout: 15000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      algorithms: this.algorithms(),
    };
  }

  /** Algoritmos admitidos; el mismo orden en la conexión y en `probeHostKey` (decide qué clave presenta el host). */
  private algorithms(): ConnectConfig['algorithms'] {
    return {
      kex: [
        'curve25519-sha256',
        'curve25519-sha256@libssh.org',
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384',
        'ecdh-sha2-nistp521',
        'diffie-hellman-group-exchange-sha256',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group14-sha1',
        'diffie-hellman-group1-sha1',
      ],
      serverHostKey: [
        'ssh-rsa',
        'rsa-sha2-512',
        'rsa-sha2-256',
        'ssh-ed25519',
        'ecdsa-sha2-nistp256',
        'ecdsa-sha2-nistp384',
        'ecdsa-sha2-nistp521',
      ],
      cipher: [
        'aes128-ctr',
        'aes192-ctr',
        'aes256-ctr',
        'aes128-gcm',
        'aes128-gcm@openssh.com',
        'aes256-gcm',
        'aes256-gcm@openssh.com',
        'aes256-cbc',
      ],
    };
  }

  private cleanPrivateKey(privateKey: string): string {
    if (!privateKey) {
      throw new BadRequestException('La llave privada está vacía');
    }

    let cleaned = privateKey.trim();

    // Si la llave tiene \n escapados, convertirlos a saltos reales
    if (cleaned.includes('\\n') && !cleaned.includes('\n')) {
      cleaned = cleaned.replace(/\\n/g, '\n');
    }

    // Normalizar saltos de línea
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/\r/g, '\n');

    // Eliminar espacios extras al final de cada línea
    cleaned = cleaned
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');

    // Verificar formato básico
    if (!cleaned.includes('-----BEGIN')) {
      throw new BadRequestException(
        'Formato de llave privada inválido. Debe comenzar con -----BEGIN',
      );
    }

    if (!cleaned.includes('-----END')) {
      throw new BadRequestException(
        'Formato de llave privada inválido. Debe terminar con -----END',
      );
    }

    return cleaned;
  }

  /**
   * Detectar tipo de llave
   * @param privateKey - La llave privada a detectar el tipo
   * @returns El tipo de llave
   */
  private detectKeyType(privateKey: string): string {
    if (privateKey.includes('BEGIN RSA PRIVATE KEY')) {
      return 'RSA (PEM format)';
    } else if (privateKey.includes('BEGIN OPENSSH PRIVATE KEY')) {
      return 'OpenSSH format';
    } else if (privateKey.includes('BEGIN PRIVATE KEY')) {
      return 'PKCS#8 format';
    } else if (privateKey.includes('BEGIN EC PRIVATE KEY')) {
      return 'EC format';
    }
    return 'Unknown';
  }
}
