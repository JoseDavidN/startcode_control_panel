// src/servers/services/agent-install.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client as SSHClient } from 'ssh2';
import { SSHService } from '@monitoring/services/ssh.service';
import { HostKeyError } from '@monitoring/services/host-key';
import { AgentGateway } from '@monitoring/gateways/agent.gateway';
import { shellQuote } from '@/common/security/shell';
import { AuthService } from '@auth/auth.service';
import { User } from '@auth/entities/user.entity';
import { Server, ServerStatus } from '../entities/server.entity';
import { ServersService } from '../servers.service';
import { AgentBinariesService, type AgentArch } from './agent-binaries.service';
import { AgentTokenService } from '@servers/services/agent-token.service';
import { NotificationsService } from '@/notifications/notifications.service';
import { NotificationSeverity, NotificationType } from '@/notifications/entities/notification.entity';
import {
  STEP_LABELS,
  type AgentInstallError,
  type AgentInstallResult,
  type AgentInstallStep,
  type AgentInstallStepId,
  type AgentStepStatus,
  type AgentUninstallResult,
} from '../types/agent-install.types';

/** Cuánto se espera a que el agente aparezca en el gateway tras instalarlo. */
const HANDSHAKE_TIMEOUT_MS = 30_000;
/** Una instalación baja 7 MB y arranca un servicio: no cabe en los 30 s de un exec normal. */
const INSTALL_TIMEOUT_MS = 300_000;
const UNINSTALL_TIMEOUT_MS = 60_000;

interface InstallOptions {
  /** Contraseña de sudo, solo si el usuario remoto no es root. No se guarda. */
  sudoPassword?: string;
  /** URL pública del panel, si hay que corregir la del `.env` para este servidor. */
  panelUrl?: string;
}

@Injectable()
export class AgentInstallService {
  private readonly logger = new Logger(AgentInstallService.name);

  constructor(
    private readonly ssh: SSHService,
    private readonly servers: ServersService,
    private readonly binaries: AgentBinariesService,
    private readonly auth: AuthService,
    private readonly gateway: AgentGateway,
    private readonly config: ConfigService,
    private readonly agentTokens: AgentTokenService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ── Instalación ────────────────────────────────────────────────── */

  async install(
    serverId: string,
    user: User,
    opts: InstallOptions = {},
  ): Promise<AgentInstallResult> {
    const server = await this.servers.findOneWithPrivateKey(serverId, user.id);
    const steps = new StepTracker((step) =>
      this.gateway.emitToOwner(server.ownerId, 'agent:install:progress', {
        serverId: server.id,
        step,
      }),
    );

    await this.servers.setAgentState(server.id, {
      state: 'installing',
      lastAttemptAt: new Date().toISOString(),
    });

    let conn: SSHClient | null = null;
    try {
      /* Antes de abrir nada: sin URL pública el servidor remoto no sabría de
         dónde descargar, y el fallo llegaría a mitad de la instalación. */
      const panel = this.panelUrls(opts.panelUrl);

      steps.set('ssh', 'running');
      conn = await this.ssh.createDedicatedClient(server);
      steps.set('ssh', 'done', `${server.username}@${server.host}`);

      const sudo = await this.resolveSudo(conn, steps, server, opts.sudoPassword);
      await this.assertSystemd(conn, sudo, steps);
      const arch = await this.detectArch(conn, sudo, steps);

      const binary = this.binaries.resolve(arch);
      /* El token nuevo entra como pendiente: si la instalación falla antes de
         escribir la configuración, el agente que ya corría sigue valiendo. Sin
         rotaciones automáticas mientras tanto, que pisarían ese pendiente. */
      this.gateway.holdRotations(server.id, true);
      const agentToken = await this.agentTokens.issueForInstall(server);
      const script = this.buildInstallScript(server, binary, arch, panel, agentToken.token);

      const result = await this.runPrivilegedScript(conn, sudo, script, {
        timeoutMs: INSTALL_TIMEOUT_MS,
        onStep: (id, status, detail) => steps.set(id, status, detail),
      });

      if (result.code !== 0) {
        throw this.fromScript(result, server, panel);
      }

      /* Reinstalado: el token nuevo es el único válido, sin gracia para el anterior. */
      await this.agentTokens.activate(server.id, agentToken.jti);

      /* Último paso sin SSH: el agente tiene que aparecer en el gateway. */
      steps.set('handshake', 'running');
      const connected = await this.waitForAgent(server.id);
      steps.set(
        'handshake',
        connected ? 'done' : 'failed',
        connected ? undefined : 'el agente no se conectó',
      );

      await this.servers.setAgentState(server.id, {
        state: 'installed',
        version: binary.version,
        arch,
        installedAt: new Date().toISOString(),
        lastError: undefined,
        steps: steps.all(),
      });

      this.logger.log(
        `🤖 Agente ${binary.version} instalado en ${server.name} (${server.host}) por ${user.email}`,
      );

      return {
        ok: true,
        serverId: server.id,
        status: connected ? ServerStatus.ONLINE : ServerStatus.PENDING,
        version: binary.version,
        arch,
        steps: steps.all(),
        warning: connected
          ? undefined
          : `El agente se instaló pero no ha conectado con el panel. Comprueba que ${server.host} alcanza ${panel.ws}.`,
      };
    } catch (error) {
      /* Clave de host cambiada: no se tocó la máquina y el panel enseña el aviso (409). */
      if (error instanceof HostKeyError) throw error;
      const failure = this.translate(error, server);
      steps.failCurrent(failure.message);

      /* Si el fallo ocurrió en las comprobaciones previas, la máquina no se
         tocó: un reintento sin contraseña no debe dejar en «error» un agente
         que sigue instalado y reportando. */
      const touched = steps
        .all()
        .some((step) => step.id === 'config' || step.id === 'service' || step.id === 'verify');
      const wasInstalled = server.metadata?.agent?.state === 'installed';

      await this.servers.setAgentState(server.id, {
        state: !touched && wasInstalled ? 'installed' : 'failed',
        lastError: { ...failure, at: new Date().toISOString() },
        steps: steps.all(),
      });

      this.logger.warn(
        `Instalación del agente fallida en ${server.name}: [${failure.code}] ${failure.message}`,
      );

      return {
        ok: false,
        serverId: server.id,
        status: ServerStatus.PENDING,
        steps: steps.all(),
        error: failure,
      };
    } finally {
      this.gateway.holdRotations(server.id, false);
      try {
        conn?.end();
      } catch {
        /* ya cerrada */
      }
    }
  }

  /* ── Desinstalación ─────────────────────────────────────────────── */

  async uninstall(
    serverId: string,
    user: User,
    opts: InstallOptions & { purge?: boolean } = {},
  ): Promise<AgentUninstallResult> {
    const server = await this.servers.findOneWithPrivateKey(serverId, user.id);
    const steps = new StepTracker((step) =>
      this.gateway.emitToOwner(server.ownerId, 'agent:install:progress', {
        serverId: server.id,
        step,
      }),
    );

    let conn: SSHClient | null = null;
    try {
      steps.set('ssh', 'running');
      conn = await this.ssh.createDedicatedClient(server);
      steps.set('ssh', 'done', `${server.username}@${server.host}`);

      const sudo = await this.resolveSudo(conn, steps, server, opts.sudoPassword);

      const script = [
        `SC_PROGRESS=1`,
        `SC_PURGE=${opts.purge ? 1 : 0}`,
        this.binaries.getUninstallerScript(),
      ].join('\n');

      const result = await this.runPrivilegedScript(conn, sudo, script, {
        timeoutMs: UNINSTALL_TIMEOUT_MS,
        onStep: (id, status, detail) => steps.set(id, status, detail),
      });

      if (result.code !== 0) {
        throw this.fromScript(result, server);
      }

      const removed = /@@REMOVED:1/.test(result.stdout);

      /* El token que tuviera la máquina deja de valer, aunque alguien guardara
         una copia de la configuración. */
      await this.revokeAgentToken(server.id);

      await this.servers.setAgentState(server.id, {
        state: 'not_installed',
        version: undefined,
        installedAt: undefined,
        lastError: undefined,
        steps: steps.all(),
      });

      this.logger.log(
        removed
          ? `🧹 Agente desinstalado de ${server.name} por ${user.email}`
          : `${server.name} no tenía agente instalado`,
      );

      return { ok: true, removed, steps: steps.all() };
    } catch (error) {
      /* Clave de host cambiada: no se tocó la máquina y el panel enseña el aviso (409). */
      if (error instanceof HostKeyError) throw error;
      const failure = this.translate(error, server);
      steps.failCurrent(failure.message);

      this.logger.warn(
        `Desinstalación fallida en ${server.name}: [${failure.code}] ${failure.message}`,
      );

      return { ok: false, removed: false, steps: steps.all(), error: failure };
    } finally {
      try {
        conn?.end();
      } catch {
        /* ya cerrada */
      }
    }
  }

  /* ── Token del agente ───────────────────────────────────────────── */

  /** Ningún token vale ya para este servidor; corta el socket si lo hay. */
  async revokeAgentToken(serverId: string): Promise<void> {
    await this.agentTokens.revoke(serverId);
    this.gateway.disconnectAgent(serverId);
  }

  /**
   * Token para instalar a mano (`deploy/install.sh`). Pasa a ser el único
   * válido: el que tuviera el agente deja de servir.
   */
  async issueManualToken(server: Pick<Server, 'id' | 'name'>): Promise<string> {
    const token = await this.agentTokens.issueAndActivate(server);
    this.gateway.disconnectAgent(server.id);
    return token;
  }

  /** Tras borrar el servidor: la fila ya no existe, solo queda cortar el socket. */
  forgetAgent(serverId: string): void {
    this.gateway.disconnectAgent(serverId);
  }

  /**
   * «Regenerar token del agente». Con el agente conectado se rota por su
   * socket: el anterior vale hasta el ACK y unos minutos de gracia. Sin
   * agente no hay por dónde mandarle uno nuevo, así que se revoca y hay que
   * reinstalar. Queda como aviso de seguridad para el dueño.
   */
  async regenerateAgentToken(
    serverId: string,
    user: User,
  ): Promise<{ mode: 'rotating' | 'revoked' }> {
    const server = await this.servers.findOne(serverId, user);

    const sent = await this.gateway.rotateAgentToken(server);
    const mode = sent === 'rotating' ? 'rotating' : 'revoked';
    if (mode === 'revoked') await this.revokeAgentToken(server.id);

    this.logger.log(
      `🔑 Token del agente de ${server.name} ${mode === 'rotating' ? 'en rotación' : 'revocado'} por ${user.email}`,
    );

    await this.notifications
      .create(user.id, {
        type: NotificationType.SECURITY,
        severity: mode === 'rotating' ? NotificationSeverity.INFO : NotificationSeverity.WARNING,
        title: 'Token del agente regenerado',
        body:
          mode === 'rotating'
            ? `Se envió un token nuevo al agente de ${server.name}. El anterior deja de valer en cuanto el agente lo confirme.`
            : `El agente de ${server.name} no estaba conectado: su token quedó revocado. Reinstala el agente para que vuelva a reportar.`,
        serverId: server.id,
        metadata: { serverName: server.name },
      })
      .catch((err) =>
        this.logger.warn(
          `Aviso de regeneración de token no guardado: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return { mode };
  }

  /* ── Sondas ─────────────────────────────────────────────────────── */

  /**
   * Cómo ejecutar con privilegios: nada si ya somos root, `sudo -n` si está
   * permitido sin contraseña, y `sudo -S` si el usuario dio una.
   */
  private async resolveSudo(
    conn: SSHClient,
    steps: StepTracker,
    server: Server,
    password?: string,
  ): Promise<SudoStrategy> {
    steps.set('privileges', 'running');

    const uid = await this.ssh.execOnClient(conn, 'id -u', { timeoutMs: 15_000 });
    if (uid.stdout.trim() === '0') {
      steps.set('privileges', 'done', 'root');
      return { kind: 'root' };
    }

    const passwordless = await this.ssh.execOnClient(conn, 'sudo -n true 2>/dev/null', {
      timeoutMs: 15_000,
    });
    if (passwordless.code === 0) {
      steps.set('privileges', 'done', 'sudo sin contraseña');
      return { kind: 'sudo-nopasswd' };
    }

    if (!password) {
      throw new InstallFailure(
        'NO_SUDO',
        `El usuario ${server.username} no es root en ${server.host} y sudo pide contraseña.`,
        `Escribe la contraseña de sudo, o añade «${server.username} ALL=(ALL) NOPASSWD: ALL» en /etc/sudoers.d/startcode-panel.`,
      );
    }

    /* Se comprueba la contraseña aquí para no fallar a mitad de la instalación
       con un error del script que no explicaría nada. */
    const check = await this.ssh.execOnClient(conn, 'sudo -S -p "" true', {
      input: `${password}\n`,
      timeoutMs: 20_000,
    });
    if (check.code !== 0) {
      throw new InstallFailure(
        'SUDO_PASSWORD',
        `La contraseña de sudo de ${server.username} no fue aceptada en ${server.host}.`,
      );
    }

    steps.set('privileges', 'done', 'sudo con contraseña');
    return { kind: 'sudo-password', password };
  }

  private async assertSystemd(
    conn: SSHClient,
    sudo: SudoStrategy,
    steps: StepTracker,
  ): Promise<void> {
    steps.set('systemd', 'running');
    const probe = await this.ssh.execOnClient(
      conn,
      'command -v systemctl >/dev/null 2>&1 && test -d /run/systemd/system && echo ok',
      { timeoutMs: 15_000 },
    );

    if (probe.stdout.trim() !== 'ok') {
      throw new InstallFailure(
        'NO_SYSTEMD',
        'El servidor no usa systemd, así que el agente no puede instalarse como servicio.',
      );
    }
    steps.set('systemd', 'done');
  }

  private async detectArch(
    conn: SSHClient,
    sudo: SudoStrategy,
    steps: StepTracker,
  ): Promise<AgentArch> {
    steps.set('arch', 'running');
    const probe = await this.ssh.execOnClient(conn, 'uname -m', { timeoutMs: 15_000 });
    const raw = probe.stdout.trim();

    const arch: AgentArch | null =
      raw === 'x86_64' || raw === 'amd64'
        ? 'amd64'
        : raw === 'aarch64' || raw === 'arm64'
          ? 'arm64'
          : null;

    if (!arch) {
      throw new InstallFailure(
        'UNSUPPORTED_ARCH',
        `Arquitectura ${raw || 'desconocida'} no soportada: solo hay binarios para x86_64 y aarch64.`,
      );
    }

    steps.set('arch', 'done', `${raw} → ${arch}`);
    return arch;
  }

  /* ── Ejecución del script ───────────────────────────────────────── */

  /**
   * Sube el script a un temporal del propio usuario y lo ejecuta con permisos.
   *
   * Se escribe primero en disco en vez de mandarlo por stdin porque con
   * `sudo -S` stdin ya lo ocupa la contraseña; mezclar las dos cosas depende de
   * cómo bufferice sudo. El temporal se crea con umask 077 y se borra siempre.
   *
   * De paso, ningún secreto aparece en la línea de comandos: `ps` en la máquina
   * remota solo ve `sh /tmp/xxxx`.
   */
  private async runPrivilegedScript(
    conn: SSHClient,
    sudo: SudoStrategy,
    script: string,
    opts: {
      timeoutMs: number;
      onStep: (id: AgentInstallStepId, status: AgentStepStatus, detail?: string) => void;
    },
  ) {
    const remotePath = `/tmp/.startcode-install-${Date.now()}.sh`;

    /* `cat > fichero` con el script por stdin: sin sudo todavía, el archivo es
       del usuario y no hace falta contraseña aquí. */
    const write = await this.ssh.execOnClient(
      conn,
      `umask 077 && cat > ${remotePath}`,
      { input: script, timeoutMs: 60_000 },
    );
    if (write.code !== 0) {
      throw new InstallFailure(
        'UNKNOWN',
        'No se pudo dejar el instalador en el servidor.',
        write.stderr,
      );
    }

    const command =
      sudo.kind === 'root'
        ? `sh ${remotePath}; rc=$?; rm -f ${remotePath}; exit $rc`
        : sudo.kind === 'sudo-nopasswd'
          ? `sudo -n sh ${remotePath}; rc=$?; rm -f ${remotePath}; exit $rc`
          : `sudo -S -p '' sh ${remotePath}; rc=$?; rm -f ${remotePath}; exit $rc`;

    const parser = new ProgressParser(opts.onStep);

    return this.ssh.execOnClient(conn, command, {
      input: sudo.kind === 'sudo-password' ? `${sudo.password}\n` : undefined,
      timeoutMs: opts.timeoutMs,
      onStdout: (chunk) => parser.push(chunk),
    });
  }

  private buildInstallScript(
    server: Server,
    binary: { sha256: string; version: string },
    arch: AgentArch,
    panel: { http: string; ws: string },
    agentToken: string,
  ): string {
    const installToken = this.auth.generateAgentInstallToken(server.id);

    /* Las variables van en comillas simples y con los apóstrofos escapados: un
       nombre de servidor con comillas no debe poder cerrar la cadena. */
    const quote = shellQuote;

    return [
      `SC_MODE=install`,
      `SC_PROGRESS=1`,
      `SC_SERVER_ID=${quote(server.id)}`,
      `SC_SERVER_NAME=${quote(server.name)}`,
      `SC_AGENT_TOKEN=${quote(agentToken)}`,
      `SC_INSTALL_TOKEN=${quote(installToken)}`,
      `SC_PANEL_HTTP=${quote(panel.http)}`,
      `SC_PANEL_WS=${quote(panel.ws)}`,
      `SC_ARCH=${quote(arch)}`,
      `SC_SHA256=${quote(binary.sha256)}`,
      `export SC_MODE SC_PROGRESS SC_SERVER_ID SC_SERVER_NAME SC_AGENT_TOKEN SC_INSTALL_TOKEN SC_PANEL_HTTP SC_PANEL_WS SC_ARCH SC_SHA256`,
      this.binaries.getInstallerScript(),
    ].join('\n');
  }

  /* ── URLs del panel ─────────────────────────────────────────────── */

  /**
   * De dónde descarga el agente y a dónde reporta.
   *
   * No se deduce de la cabecera `Host` de la petición: el navegador puede estar
   * en `localhost`, que desde el servidor remoto no lleva a ninguna parte.
   */
  private panelUrls(override?: string): { http: string; ws: string } {
    const base = (override ?? this.config.get<string>('PANEL_PUBLIC_URL', '')).replace(
      /\/+$/,
      '',
    );

    if (base && !isHttpUrl(base)) {
      throw new InstallFailure(
        'PANEL_URL_MISSING',
        'La URL pública del panel no es válida.',
        'Debe ser http:// o https:// seguida del host y, si hace falta, el puerto (por ejemplo http://192.168.1.50:3001).',
      );
    }

    if (!base) {
      throw new InstallFailure(
        'PANEL_URL_MISSING',
        'Falta PANEL_PUBLIC_URL en la configuración del panel.',
        'Es la URL por la que los servidores monitorizados alcanzan al panel (por ejemplo http://192.168.1.50:3001), que no tiene por qué ser la del navegador.',
      );
    }

    const explicitWs = this.config.get<string>('PANEL_AGENT_WS_URL', '');
    const ws = explicitWs
      ? explicitWs.replace(/\/+$/, '')
      : `${base.replace(/^http/, 'ws')}/agent`;

    return { http: `${base}/api/v1`, ws };
  }

  /* ── Esperas y errores ──────────────────────────────────────────── */

  private async waitForAgent(serverId: string): Promise<boolean> {
    const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (this.gateway.isAgentConnected(serverId)) return true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }

  /** Convierte la salida del script en un fallo con código y mensaje propios. */
  private fromScript(
    result: { stdout: string; stderr: string; code: number },
    server: Server,
    panel?: { http: string; ws: string },
  ): InstallFailure {
    const output = `${result.stdout}\n${result.stderr}`;
    const marked = /ERROR \[([a-z]+)\] ([^\n]*)/.exec(output);
    const stepId = marked?.[1];
    const detail = marked?.[2]?.trim();

    if (/sudo:.*password|Sorry, try again/i.test(output)) {
      return new InstallFailure(
        'SUDO_PASSWORD',
        `sudo rechazó la contraseña de ${server.username} en ${server.host}.`,
      );
    }
    if (stepId === 'download') {
      return new InstallFailure(
        'DOWNLOAD_FAILED',
        `El servidor no pudo descargar el agente${panel ? ` desde ${panel.http}` : ''}. Comprueba que ${server.host} alcanza el panel (cortafuegos, DNS, puerto).`,
        detail,
      );
    }
    if (stepId === 'checksum') {
      return new InstallFailure(
        'CHECKSUM',
        'El binario descargado no coincide con su suma sha256; se abortó la instalación.',
        detail,
      );
    }
    if (stepId === 'systemd') {
      return new InstallFailure('NO_SYSTEMD', detail ?? 'El servidor no usa systemd.');
    }
    if (stepId === 'arch') {
      return new InstallFailure('UNSUPPORTED_ARCH', detail ?? 'Arquitectura no soportada.');
    }
    if (stepId === 'privileges') {
      return new InstallFailure('NO_SUDO', detail ?? 'Hacen falta permisos de administrador.');
    }
    if (/No space left on device/i.test(output)) {
      return new InstallFailure(
        'DISK_FULL',
        `No queda espacio en el disco de ${server.host}.`,
        detail,
      );
    }
    if (stepId === 'service' || stepId === 'verify') {
      return new InstallFailure(
        'SERVICE_FAILED',
        'El servicio startcode-agent no llegó a arrancar en el servidor.',
        detail?.replace(/\|/g, '\n'),
      );
    }

    return new InstallFailure(
      'UNKNOWN',
      detail ?? `El instalador terminó con código ${result.code}.`,
      output.trim().slice(-1500),
    );
  }

  /** Traduce cualquier excepción a un error con código y mensaje en castellano. */
  private translate(error: unknown, server: Server): AgentInstallError {
    if (error instanceof InstallFailure) {
      return { code: error.code, message: error.message, detail: error.detail };
    }

    const message = error instanceof Error ? error.message : String(error);

    if (/authentication methods failed|Cannot parse privateKey|All configured/i.test(message)) {
      return {
        code: 'SSH_AUTH',
        message: `La clave SSH no fue aceptada por ${server.username}@${server.host}. Comprueba que la pública esté en ~/.ssh/authorized_keys.`,
      };
    }
    if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|Timeout de conexión/i.test(message)) {
      return {
        code: 'SSH_UNREACHABLE',
        message: `No se pudo conectar por SSH a ${server.host}:${server.port}.`,
        detail: message,
      };
    }
    if (/binario del agente|manifest|make release/i.test(message)) {
      return { code: 'BINARY_MISSING', message };
    }

    return { code: 'UNKNOWN', message, detail: message };
  }
}

/* ── Auxiliares ───────────────────────────────────────────────────── */

type SudoStrategy =
  | { kind: 'root' }
  | { kind: 'sudo-nopasswd' }
  | { kind: 'sudo-password'; password: string };

/** Error con código propio, para no adivinar la causa a partir del texto. */
class InstallFailure extends Error {
  constructor(
    readonly code: AgentInstallError['code'],
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

/**
 * Lleva la cuenta de los pasos y avisa al panel de cada cambio.
 *
 * El resultado completo viaja además en la respuesta HTTP: el socket es un
 * lujo, no el canal del que depende la operación.
 */
class StepTracker {
  private readonly steps = new Map<AgentInstallStepId, AgentInstallStep>();
  private current: AgentInstallStepId | null = null;

  constructor(private readonly emit: (step: AgentInstallStep) => void) {}

  set(id: AgentInstallStepId, status: AgentStepStatus, detail?: string): void {
    const step: AgentInstallStep = { id, label: STEP_LABELS[id], status, detail };
    this.steps.set(id, step);
    this.current = status === 'running' ? id : this.current;
    this.emit(step);
  }

  /** Marca como fallido el paso que estaba en curso cuando saltó el error. */
  failCurrent(detail: string): void {
    const id = this.current ?? 'ssh';
    const existing = this.steps.get(id);
    if (existing?.status === 'failed') return;
    this.set(id, 'failed', detail);
  }

  all(): AgentInstallStep[] {
    return [...this.steps.values()];
  }
}

/** Lee las líneas `@@STEP:id:status[:detalle]` que imprime el script. */
class ProgressParser {
  private buffer = '';

  constructor(
    private readonly onStep: (
      id: AgentInstallStepId,
      status: AgentStepStatus,
      detail?: string,
    ) => void,
  ) {}

  push(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    /* La última puede estar a medias: se guarda para el siguiente trozo. */
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const match = /^@@STEP:([a-z]+):([a-z]+):?(.*)$/.exec(line.trim());
      if (!match) continue;

      const [, id, status, detail] = match;
      if (!(id in STEP_LABELS)) continue;

      this.onStep(
        id as AgentInstallStepId,
        status as AgentStepStatus,
        detail?.trim() || undefined,
      );
    }
  }
}

/** URL http(s) sin credenciales, espacios ni caracteres de control: va al instalador del servidor remoto. */
function isHttpUrl(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  if (/[\s\x00-\x1f\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}
