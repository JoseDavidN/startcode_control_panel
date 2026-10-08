import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Client as SSHClient } from 'ssh2';
import { ServersService } from '@servers/servers.service';
import { SSHService, SSHExecResult } from './ssh.service';
import { ServiceControlService } from './service-control.service';
import { CommandAudit, CommandAuditStatus } from '../entities/command-audit.entity';
import { checkCommandPolicy } from './command-policy';

export interface CommandResult {
  id: string;
  command: string;
  /** Directorio en el que se ejecutó: siempre el home del usuario SSH. */
  cwd: string;
  /** Home del usuario SSH (no el de root con sudo), para mostrar las rutas como `~`. */
  home: string | null;
  output: string;
  exitCode: number | null;
  status: CommandAuditStatus;
  durationMs: number;
  truncated: boolean;
  sudo: boolean;
}

export interface CommandHistoryEntry {
  id: string;
  command: string;
  cwd: string | null;
  sudo: boolean;
  status: CommandAuditStatus;
  exitCode: number | null;
  durationMs: number;
  truncated: boolean;
  createdAt: Date;
  user: { id: string; name: string; email: string };
}

export interface ExecCommandOptions {
  command: string;
  sudo?: boolean;
  sudoPassword?: string;
  /** El usuario ya confirmó un comando marcado como peligroso. */
  confirm?: boolean;
}

/** Tiempo máximo del comando en el servidor; `timeout` lo mata allí. */
const COMMAND_TIMEOUT_S = 60;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_COMMAND_LENGTH = 4000;
/* `timeout` devuelve 124 al cortar por tiempo, y 137 si tuvo que usar -k. */
const TIMEOUT_CODES = [124, 137];
/* Separador entre la salida y el código/directorio final, en stderr. */
const MARK = '\u001e__SC__';

/**
 * Comandos que piden confirmación explícita: no se bloquean (la terminal
 * permite lo mismo), pero no deben salir de un Enter accidental.
 */
const DANGEROUS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\brm\s+(-[a-z]*\s+)*-[a-z]*r[a-z]*\s+(-[a-z]*\s+)*(\/|\/\*|~|\$HOME)(\s|$)/i, reason: 'borra el sistema de archivos o el home completo' },
  { pattern: /\bmkfs(\.\w+)?\b/, reason: 'formatea un disco' },
  { pattern: /\bdd\b[^\n]*\bof=\/dev\//, reason: 'escribe directamente sobre un dispositivo' },
  { pattern: />\s*\/dev\/(sd|nvme|vd|xvd|hd)\w*/, reason: 'escribe directamente sobre un disco' },
  { pattern: /\b(shutdown|poweroff|halt|reboot)\b/, reason: 'apaga o reinicia el servidor' },
  { pattern: /\binit\s+[06]\b/, reason: 'apaga o reinicia el servidor' },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: 'es una fork bomb' },
  { pattern: /\bchmod\s+(-[a-z]*\s+)*-[a-z]*R[a-z]*\s+[0-7]*7[0-7]*\s+\/(\s|$)/, reason: 'cambia permisos de todo el sistema' },
  { pattern: /\bsystemctl\s+(stop|disable|mask)\s+(sshd?|startcode-agent)\b/, reason: 'corta la conexión del panel con el servidor' },
];

/**
 * `sudo ` escrito a mano al inicio: se quita y el comando va por la escalera
 * de sudo del panel, que es la que sabe pasar la contraseña (sin TTY, un
 * `sudo` del usuario se quedaría pidiéndola). Con opciones (`sudo -u postgres`)
 * no se toca: el usuario está pidiendo algo que la escalera no hace.
 */
const LEADING_SUDO = /^sudo\s+(?!-)/;

/** Comilla simple de shell: `'` → `'\''`. */
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

@Injectable()
export class CommandService {
  private readonly logger = new Logger(CommandService.name);

  constructor(
    @InjectRepository(CommandAudit)
    private readonly auditRepository: Repository<CommandAudit>,
    private readonly sshService: SSHService,
    private readonly serversService: ServersService,
    private readonly serviceControl: ServiceControlService,
  ) {}

  /**
   * Ejecuta un comando puntual por SSH, sin TTY, siempre en el home del
   * usuario SSH: cada llamada es una conexión nueva y el directorio no se
   * arrastra entre comandos. Lo que convierte esto en una terminal (moverse,
   * ver la ruta, inspeccionar discos, abrir un shell) lo rechaza
   * `checkCommandPolicy` antes de conectar. Todo intento que llega a
   * conectar queda auditado, también los que fallan.
   */
  async exec(serverId: string, userId: string, opts: ExecCommandOptions): Promise<CommandResult> {
    const typed = opts.command.trim();
    const command = typed.replace(LEADING_SUDO, '').trim();
    if (!command) throw new BadRequestException('El comando está vacío');
    if (command.length > MAX_COMMAND_LENGTH) {
      throw new BadRequestException(`El comando supera ${MAX_COMMAND_LENGTH} caracteres`);
    }

    const violation = checkCommandPolicy(command);
    if (violation) {
      throw new BadRequestException({
        code: 'BLOCKED_COMMAND',
        message: `\`${violation.program}\` no está permitido en la línea de comandos: ${violation.reason}.`,
        hint: 'La línea de comandos es para comandos puntuales; para trabajar como en una consola, abre la terminal SSH.',
      });
    }

    const danger = DANGEROUS.find(d => d.pattern.test(command));
    if (danger && !opts.confirm) {
      throw new BadRequestException({
        code: 'DANGEROUS_COMMAND',
        message: `Este comando ${danger.reason}.`,
        hint: 'Confírmalo para ejecutarlo de todas formas.',
      });
    }

    const server = await this.serversService.findOneWithPrivateKey(serverId, userId);
    const sudo = Boolean(opts.sudo) || command !== typed;
    const started = Date.now();

    this.logger.log(
      `[${server.name}] ${sudo ? 'sudo ' : ''}${command.slice(0, 200)} (usuario ${userId})`,
    );

    let conn: SSHClient | null = null;
    let result: SSHExecResult;
    try {
      conn = await this.sshService.createDedicatedClient(server);
      const remote = this.buildRemoteCommand(command);

      if (sudo) {
        const strategy = await this.serviceControl.resolveSudo(conn, server, opts.sudoPassword);
        result = await this.serviceControl.run(conn, strategy, remote, (COMMAND_TIMEOUT_S + 15) * 1000, {
          maxOutputBytes: MAX_OUTPUT_BYTES,
        });
      } else {
        result = await this.sshService.execOnClient(conn, remote, {
          /* stdin cerrado: un comando que lea de él (`cat` a secas) termina en
             vez de quedarse esperando hasta el timeout. */
          input: '',
          timeoutMs: (COMMAND_TIMEOUT_S + 15) * 1000,
          maxOutputBytes: MAX_OUTPUT_BYTES,
        });
      }
    } catch (error) {
      /* SSH caído, sudo rechazado… también se audita: es un intento. */
      await this.audit({ serverId, userId, command, cwd: '~', sudo, status: CommandAuditStatus.FAILED,
        exitCode: null, durationMs: Date.now() - started, truncated: false });
      throw error;
    } finally {
      conn?.end();
    }

    const { output, exitCode, home } = this.parse(result);
    const cwd = home ?? '~';
    const status = TIMEOUT_CODES.includes(exitCode ?? -1) && !result.stderr.includes(MARK)
      ? CommandAuditStatus.TIMEOUT
      : exitCode === 0
        ? CommandAuditStatus.OK
        : CommandAuditStatus.ERROR;
    const durationMs = Date.now() - started;
    const truncated = Boolean(result.truncated);

    const row = await this.audit({ serverId, userId, command, cwd, sudo, status, exitCode,
      durationMs, truncated });

    return {
      id: row.id,
      command,
      cwd,
      home,
      output: status === CommandAuditStatus.TIMEOUT
        ? `${output}\n[cortado: superó ${COMMAND_TIMEOUT_S} s]`.trimStart()
        : output,
      exitCode,
      status,
      durationMs,
      truncated,
      sudo,
    };
  }

  /**
   * Últimos comandos del servidor, de cualquier usuario, más recientes primero.
   * El acceso al servidor lo comprueba el controlador.
   */
  async history(serverId: string, limit = 50): Promise<CommandHistoryEntry[]> {
    const rows = await this.auditRepository.find({
      where: { serverId },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });

    return rows.map(row => ({
      id: row.id,
      command: row.command,
      cwd: row.cwd,
      sudo: row.sudo,
      status: row.status,
      exitCode: row.exitCode,
      durationMs: row.durationMs,
      truncated: row.truncated,
      createdAt: row.createdAt,
      user: {
        id: row.userId,
        name: row.user ? `${row.user.firstname} ${row.user.lastname}`.trim() : '',
        email: row.user?.email ?? '',
      },
    }));
  }

  /**
   * `bash -c` con el comando dentro de un bloque `{ }`, siempre desde el home.
   * stdout y stderr del comando van juntos (como en una terminal); stderr de
   * la envoltura solo lleva la marca con el código y el home. `timeout` mata
   * el proceso en el servidor, no solo la espera del panel.
   *
   * `~` es siempre el home del usuario SSH: con sudo el shell corre como root
   * y `cd ~` llevaría a /root, así que se resuelve desde `$SUDO_USER`.
   */
  private buildRemoteCommand(command: string): string {
    const script = [
      '__home=$(getent passwd "${SUDO_USER:-$(id -un)}" | cut -d: -f6)',
      '__home=${__home:-$HOME}',
      'cd -- "$__home"',
      `{ ${command}\n} 2>&1`,
      '__rc=$?',
      `printf '${MARK}%s\\t%s' "$__rc" "$__home" >&2`,
      'exit $__rc',
    ].join('\n');

    return `timeout -k 5 ${COMMAND_TIMEOUT_S} bash -c ${shellQuote(script)}`;
  }

  private parse(result: SSHExecResult) {
    const markAt = result.stderr.lastIndexOf(MARK);
    let exitCode: number | null = result.code;
    let home: string | null = null;

    if (markAt >= 0) {
      const [rc, homeDir] = result.stderr.slice(markAt + MARK.length).split('\t');
      const parsed = Number(rc);
      if (Number.isFinite(parsed)) exitCode = parsed;
      if (homeDir?.trim()) home = homeDir.trim();
    }

    /* Lo que quede en stderr fuera de la marca (p. ej. sudo o el propio bash)
       también es salida para el usuario. */
    const extra = (markAt >= 0 ? result.stderr.slice(0, markAt) : result.stderr).trim();
    const output = [result.stdout.replace(/\s+$/, ''), extra].filter(Boolean).join('\n');

    return { output, exitCode, home };
  }

  private async audit(entry: Omit<CommandAudit, 'id' | 'createdAt' | 'user' | 'server'>) {
    try {
      return await this.auditRepository.save(this.auditRepository.create(entry));
    } catch (error) {
      /* Que falle la auditoría no deshace un comando ya ejecutado. */
      this.logger.error(`No se pudo auditar el comando: ${(error as Error).message}`);
      return { id: '' } as CommandAudit;
    }
  }
}
