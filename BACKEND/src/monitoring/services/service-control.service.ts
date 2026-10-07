import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Client as SSHClient } from 'ssh2';
import { ServersService } from '@servers/servers.service';
import { Server } from '@servers/entities/server.entity';
import { SSHService } from './ssh.service';
import { AgentDataService } from './agent-data.service';
import { AgentGateway } from '../gateways/agent.gateway';
import { ServiceAction } from '../dto/service-action.dto';

export interface ServiceLogsResult {
  service: string;
  lines: string;
}

export interface ServiceActionResult {
  success: boolean;
  action: string;
  service: string;
  /** Estado leído del servidor justo después de la acción. */
  state: string;
  subState: string;
  pid: number | null;
  enabled: boolean;
  output: string;
  /** Motivo legible cuando `success` es false. */
  error?: string;
}

export interface KillProcessResult {
  success: boolean;
  pid: number;
  name: string;
  /** El proceso ya no existe tras la señal. SIGTERM se puede ignorar o tardar. */
  exited: boolean;
  /** Motivo legible cuando `success` es false. */
  error?: string;
}

/** Cómo se consigue root en la máquina remota para este comando. */
export type SudoStrategy =
  | { kind: 'root' }
  | { kind: 'sudo-nopasswd' }
  | { kind: 'sudo-password'; password: string };

const EXEC_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 15_000;

/**
 * Unidades que el panel no deja parar ni deshabilitar.
 *
 * Todo lo que el panel hace en la máquina —métricas, terminal, SFTP, estas
 * mismas acciones— viaja por SSH: parar `sshd` deja el servidor incomunicado y
 * el propio panel no podría deshacerlo. `startcode-agent` no es tan grave,
 * pero apagarlo desde aquí deja la interfaz ciega sin avisar. Reiniciarlas sí
 * se permite: `sshd` no corta las sesiones ya establecidas.
 */
const PROTECTED_UNITS = ['sshd', 'ssh', 'startcode-agent'];
const PROTECTED_ACTIONS: ServiceAction[] = [ServiceAction.STOP, ServiceAction.DISABLE];

/**
 * Procesos que el panel no deja cerrar: los mismos motivos que
 * PROTECTED_UNITS, más init, que tumbaría la máquina entera.
 */
const PROTECTED_PROCESSES = ['sshd', 'startcode-agent', 'systemd', 'init'];

/** Espera hasta ~3 s a que el proceso termine tras SIGTERM; `ps` no pide privilegios. */
const waitForExit = (pid: number) =>
  `for i in 1 2 3 4 5 6; do ps -p ${pid} >/dev/null 2>&1 || exit 0; sleep 0.5; done; exit 1`;

/** Compara nombres de unidad tolerando el sufijo `.service`. */
const unitName = (unit: string) => unit.replace(/\.service$/, '');

@Injectable()
export class ServiceControlService {
  private readonly logger = new Logger(ServiceControlService.name);

  // Regex de nombres de servicio systemd válidos: letras, dígitos, punto, guion, arroba, subrayado
  private static readonly VALID_SERVICE_NAME = /^[a-zA-Z0-9._@-]+$/;

  constructor(
    private readonly sshService: SSHService,
    private readonly serversService: ServersService,
    private readonly agentData: AgentDataService,
    private readonly gateway: AgentGateway,
  ) {}

  /**
   * Ejecuta `systemctl <action> <servicio>` por SSH.
   *
   * Va todo sobre una única conexión dedicada: `executeCommand` abre una
   * conexión nueva por comando —y mata la anterior de ese servidor—, así que
   * la secuencia «resolver privilegios → actuar → releer estado» se pisaría a
   * sí misma.
   *
   * Devuelve 200 también cuando systemctl falla: que una unidad no arranque es
   * el resultado de la operación, no un error de transporte, y la interfaz
   * necesita el motivo para pintarlo.
   */
  async executeAction(
    serverId: string,
    userId: string,
    serviceName: string,
    action: ServiceAction,
    sudoPassword?: string,
  ): Promise<ServiceActionResult> {
    this.assertValidName(serviceName);

    if (
      PROTECTED_ACTIONS.includes(action) &&
      PROTECTED_UNITS.includes(unitName(serviceName))
    ) {
      throw new BadRequestException({
        code: 'PROTECTED_UNIT',
        message: `${serviceName} mantiene la conexión del panel con el servidor: no se puede ${action} desde aquí.`,
        hint: 'Hazlo desde la terminal del propio servidor si de verdad hace falta.',
      });
    }

    const server = await this.serversService.findOneWithPrivateKey(serverId, userId);

    this.logger.log(
      `systemctl ${action} ${serviceName} en ${server.name} (${server.host})`,
    );

    let conn: SSHClient | null = null;
    try {
      conn = await this.sshService.createDedicatedClient(server);
      const sudo = await this.resolveSudo(conn, server, sudoPassword);

      const result = await this.run(
        conn,
        sudo,
        `systemctl ${action} ${serviceName}`,
        EXEC_TIMEOUT_MS,
      );
      const success = result.code === 0;

      const status = await this.readStatus(conn, serviceName);

      if (!success) {
        this.logger.warn(
          `systemctl ${action} ${serviceName} falló (code ${result.code}): ${result.stderr}`,
        );
      }

      await this.persist(server, serviceName, status);

      return {
        success,
        action,
        service: serviceName,
        ...status,
        output: (result.stdout || result.stderr || '').trim(),
        error: success
          ? undefined
          : await this.explainFailure(conn, serviceName, result.stderr),
      };
    } finally {
      conn?.end();
    }
  }

  /**
   * Últimas líneas del journal de la unidad.
   *
   * Que un servicio esté en `failed` casi nunca se arregla dándole otra vez a
   * «Iniciar»: el motivo está aquí, y sin esto había que salir a la terminal.
   *
   * Se intenta primero sin sudo —con el usuario en el grupo `systemd-journal`
   * basta, y es lo normal— y solo se escala si el journal se queja.
   */
  async readLogs(
    serverId: string,
    userId: string,
    serviceName: string,
    opts: { lines?: number; sudoPassword?: string } = {},
  ): Promise<ServiceLogsResult> {
    this.assertValidName(serviceName);

    const lines = Math.min(Math.max(opts.lines ?? 100, 10), 500);
    const server = await this.serversService.findOneWithPrivateKey(serverId, userId);
    const command = `journalctl -u ${serviceName} -n ${lines} --no-pager --output=short-iso`;

    let conn: SSHClient | null = null;
    try {
      conn = await this.sshService.createDedicatedClient(server);

      const plain = await this.sshService.execOnClient(conn, command, {
        timeoutMs: EXEC_TIMEOUT_MS,
      });
      if (plain.code === 0 && plain.stdout.trim()) {
        return { service: serviceName, lines: plain.stdout.trim() };
      }

      /* Sin permiso para leer el journal del sistema: se reintenta con la
         misma escalera de privilegios que las acciones. */
      const sudo = await this.resolveSudo(conn, server, opts.sudoPassword);
      const escalated = await this.run(conn, sudo, command, EXEC_TIMEOUT_MS);

      return {
        service: serviceName,
        lines:
          escalated.stdout.trim() ||
          escalated.stderr.trim() ||
          plain.stderr.trim() ||
          'El journal no devolvió nada para esta unidad.',
      };
    } finally {
      conn?.end();
    }
  }

  /**
   * Cierra un proceso con SIGTERM (`kill -TERM`, nunca `-9`): el proceso
   * recibe el aviso y puede terminar limpio. Se intenta primero sin sudo —si
   * es del propio usuario SSH basta— y solo se escala si `kill` no tiene permiso.
   */
  async killProcess(
    serverId: string,
    userId: string,
    pid: number,
    sudoPassword?: string,
  ): Promise<KillProcessResult> {
    if (!Number.isInteger(pid) || pid <= 1) {
      throw new BadRequestException('PID inválido');
    }

    const server = await this.serversService.findOneWithPrivateKey(serverId, userId);

    let conn: SSHClient | null = null;
    try {
      conn = await this.sshService.createDedicatedClient(server);

      const probe = await this.sshService.execOnClient(conn, `ps -o comm= -p ${pid}`, {
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      const name = probe.stdout.trim();
      if (probe.code !== 0 || !name) {
        throw new NotFoundException({
          code: 'PROCESS_NOT_FOUND',
          message: `El proceso ${pid} ya no existe en ${server.host}.`,
        });
      }

      if (PROTECTED_PROCESSES.includes(name)) {
        throw new BadRequestException({
          code: 'PROTECTED_PROCESS',
          message: `${name} mantiene el servidor o la conexión del panel: no se puede cerrar desde aquí.`,
        });
      }

      this.logger.log(`kill -TERM ${pid} (${name}) en ${server.name} (${server.host})`);

      const command = `kill -TERM ${pid}`;
      let result = await this.sshService.execOnClient(conn, command, {
        timeoutMs: PROBE_TIMEOUT_MS,
      });

      if (result.code !== 0 && /not permitted/i.test(result.stderr)) {
        const sudo = await this.resolveSudo(conn, server, sudoPassword);
        result = await this.run(conn, sudo, command, PROBE_TIMEOUT_MS);
      }

      if (result.code !== 0) {
        return {
          success: false,
          pid,
          name,
          exited: false,
          error: result.stderr.trim().slice(0, 500) || 'kill terminó con error y no dio ningún motivo.',
        };
      }

      const wait = await this.sshService.execOnClient(conn, waitForExit(pid), {
        timeoutMs: PROBE_TIMEOUT_MS,
      });

      return { success: true, pid, name, exited: wait.code === 0 };
    } finally {
      conn?.end();
    }
  }

  private assertValidName(serviceName: string): void {
    if (!ServiceControlService.VALID_SERVICE_NAME.test(serviceName)) {
      throw new BadRequestException('Nombre de servicio inválido');
    }
  }

  /* ── Privilegios ────────────────────────────────────────────────── */

  /**
   * Misma escalera que usa el instalador del agente: root, sudo sin
   * contraseña, o contraseña validada antes de tocar nada.
   *
   * `sudo` a secas sobre un exec sin PTY no sirve: si pidiera contraseña se
   * quedaría esperando en stdin hasta agotar el timeout.
   *
   * Pública porque DockerService usa la misma escalera.
   */
  async resolveSudo(
    conn: SSHClient,
    server: Server,
    password?: string,
  ): Promise<SudoStrategy> {
    const uid = await this.sshService.execOnClient(conn, 'id -u', {
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    if (uid.stdout.trim() === '0') return { kind: 'root' };

    const passwordless = await this.sshService.execOnClient(
      conn,
      'sudo -n true 2>/dev/null',
      { timeoutMs: PROBE_TIMEOUT_MS },
    );
    if (passwordless.code === 0) return { kind: 'sudo-nopasswd' };

    if (!password) {
      throw new ForbiddenException({
        code: 'SUDO_REQUIRED',
        message: `El usuario ${server.username} no es root en ${server.host} y sudo pide contraseña.`,
        hint: `Escribe la contraseña de sudo, o añade «${server.username} ALL=(ALL) NOPASSWD: ALL» en /etc/sudoers.d/startcode-panel.`,
      });
    }

    const check = await this.sshService.execOnClient(conn, 'sudo -S -p "" true', {
      input: `${password}\n`,
      timeoutMs: 20_000,
    });
    if (check.code !== 0) {
      throw new BadRequestException({
        code: 'SUDO_PASSWORD',
        message: `La contraseña de sudo de ${server.username} no fue aceptada en ${server.host}.`,
      });
    }

    return { kind: 'sudo-password', password };
  }

  run(
    conn: SSHClient,
    sudo: SudoStrategy,
    command: string,
    timeoutMs: number,
    extra: { maxOutputBytes?: number } = {},
  ) {
    const prefixed =
      sudo.kind === 'root'
        ? command
        : sudo.kind === 'sudo-nopasswd'
          ? `sudo -n ${command}`
          : `sudo -S -p '' ${command}`;

    return this.sshService.execOnClient(conn, prefixed, {
      input: sudo.kind === 'sudo-password' ? `${sudo.password}\n` : undefined,
      timeoutMs,
      maxOutputBytes: extra.maxOutputBytes,
    });
  }

  /* ── Estado tras la acción ──────────────────────────────────────── */

  /**
   * Lee el estado real de la unidad. `systemctl show` no necesita privilegios,
   * así que va sin sudo.
   */
  private async readStatus(
    conn: SSHClient,
    serviceName: string,
  ): Promise<{ state: string; subState: string; pid: number | null; enabled: boolean }> {
    const shown = await this.sshService.execOnClient(
      conn,
      `systemctl show ${serviceName} --no-pager -p ActiveState -p SubState -p MainPID -p UnitFileState`,
      { timeoutMs: PROBE_TIMEOUT_MS },
    );

    const props = new Map<string, string>();
    for (const line of shown.stdout.split('\n')) {
      const separator = line.indexOf('=');
      if (separator > 0) {
        props.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      }
    }

    const pid = Number(props.get('MainPID') ?? 0);

    return {
      state: props.get('ActiveState') || 'unknown',
      subState: props.get('SubState') || '',
      pid: Number.isFinite(pid) && pid > 0 ? pid : null,
      enabled: props.get('UnitFileState') === 'enabled',
    };
  }

  /** `systemctl` a veces calla en stderr; entonces el motivo está en el status. */
  private async explainFailure(
    conn: SSHClient,
    serviceName: string,
    stderr: string,
  ): Promise<string> {
    const direct = stderr.trim();
    if (direct) return direct.slice(0, 500);

    const status = await this.sshService.execOnClient(
      conn,
      `systemctl status ${serviceName} --no-pager -n 5`,
      { timeoutMs: PROBE_TIMEOUT_MS },
    );

    return (
      (status.stdout || status.stderr).trim().slice(0, 500) ||
      'systemctl terminó con error y no dio ningún motivo.'
    );
  }

  /* ── Persistencia ───────────────────────────────────────────────── */

  /**
   * Deja el inventario guardado al día y avisa al frontend. Sin esto el badge
   * de la tarjeta seguiría mostrando el estado anterior hasta el siguiente
   * inventario del agente, que tarda hasta cinco minutos.
   */
  private async persist(
    server: Server,
    serviceName: string,
    status: { state: string; subState: string; pid: number | null; enabled: boolean },
  ): Promise<void> {
    try {
      const services = await this.agentData.patchServiceState(server.id, {
        name: serviceName,
        ...status,
      });
      if (!services) return;

      this.gateway.emitToOwner(server.ownerId, 'server:services:updated', {
        serverId: server.id,
        services,
      });
    } catch (error) {
      /* La acción ya se ejecutó en la máquina: que no se pueda refrescar el
         inventario no la convierte en un fallo. */
      this.logger.warn(
        `No se pudo actualizar el inventario tras ${serviceName}: ${(error as Error).message}`,
      );
    }
  }
}
