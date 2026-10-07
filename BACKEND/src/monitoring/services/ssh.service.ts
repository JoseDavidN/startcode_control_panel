// src/monitoring/services/ssh.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Client } from 'ssh2';
import type { ConnectConfig } from 'ssh2';
import { Server } from '@servers/entities/server.entity';

export interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
  /** La salida superó `maxOutputBytes` y se recortó. */
  truncated?: boolean;
}

@Injectable()
export class SSHService {
  private readonly logger = new Logger(SSHService.name);
  private connections: Map<string, Client> = new Map();

  /**
   * Conectar a un servidor SSH
   * @param server - El servidor a conectar
   * @param forceNew - Si se debe forzar una nueva conexión
   * @returns La conexión SSH
   */
  async connect(server: Server, forceNew: boolean = false): Promise<Client> {
    return new Promise((resolve, reject) => {
      try {
        // SIEMPRE crear nueva conexión para evitar problemas de canales
        // Eliminar conexión previa si existe
        if (this.connections.has(server.id)) {
          const oldConn = this.connections.get(server.id);
          if (oldConn) {
            try {
              oldConn.end();
            } catch (e) {
              // Ignorar errores al cerrar
            }
          }
          this.connections.delete(server.id);
        }

        this.logger.debug(
          `🔗 Creando nueva conexión a ${server.host}:${server.port} como ${server.username}`,
        );

        // Limpiar la llave privada
        const cleanPrivateKey = this.cleanPrivateKey(server.privateKey);
        this.logger.debug(`Llave limpia, longitud: ${cleanPrivateKey.length}`);
        this.logger.debug(
          `Tipo de llave: ${this.detectKeyType(cleanPrivateKey)}`,
        );

        const conn = new Client();

        // Timeout de conexión
        const timeout = setTimeout(() => {
          conn.end();
          reject(new Error('Timeout de conexión SSH (15 segundos)'));
        }, 15000);

        conn.on('ready', () => {
          clearTimeout(timeout);
          this.connections.set(server.id, conn);
          this.logger.log(`✅ Conectado exitosamente a ${server.name}`);
          resolve(conn);
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          this.logger.error(
            `❌ Error SSH en ${server.name}: ${err.message}`,
          );
          reject(err);
        });

        conn.on('close', () => {
          this.connections.delete(server.id);
          this.logger.debug(`Conexión cerrada: ${server.name}`);
        });

        // Intentar conectar
        conn.connect(this.connectOptions(server));
      } catch (error) {
        this.logger.error(`Error al preparar conexión: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Cliente SSH dedicado, fuera del pool. Lo usa la terminal interactiva: el
   * pool se recicla en cada `connect()`, así que compartirlo cortaría la sesión
   * del usuario cada vez que el monitoreo ejecuta un comando (y al revés).
   */
  async createDedicatedClient(server: Server): Promise<Client> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('Timeout de conexión SSH (15 segundos)'));
      }, 15000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        this.logger.log(`🖥️  Terminal SSH abierta en ${server.name}`);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      conn.connect(this.connectOptions(server));
    });
  }

  /**
   * Desconectar de un servidor
   * @param serverId - El ID del servidor a desconectar
   * @returns void
   */
  async disconnect(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId);
    if (conn) {
      try {
        conn.end();
        this.logger.debug(`🔌 Desconectando del servidor ${serverId}`);
      } catch (error) {
        this.logger.warn(`Error al desconectar ${serverId}: ${error.message}`);
      }
      this.connections.delete(serverId);
    }
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
        this.logger.error(`Error en comando "${command}": ${error.message}`);
        results.push({
          stdout: '',
          stderr: error.message,
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
  async testConnection(server: Server): Promise<boolean> {
    try {
      await this.connect(server);
      const result = await this.executeCommand(server, 'echo "test"');
      return result.code === 0 && result.stdout === 'test';
    } catch (error) {
      this.logger.error(`Test de conexión falló: ${error.message}`);
      return false;
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
  private connectOptions(server: Server): ConnectConfig {
    return {
      host: server.host,
      port: server.port,
      username: server.username,
      privateKey: Buffer.from(this.cleanPrivateKey(server.privateKey), 'utf8'),
      readyTimeout: 15000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
          algorithms: {
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
          },
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
