import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import type { Client as SSHClient } from 'ssh2';
import { ServersService } from '@servers/servers.service';
import { AgentGateway } from '../gateways/agent.gateway';
import { SSHService, SSHExecResult } from './ssh.service';
import { ServiceControlService, SudoStrategy } from './service-control.service';
import {
  DETECT_OS_COMMAND, INSTALL_GROUPS, INSTALLABLE, SSH_CLIENT_IP, isInstallGroup, isInstallable, parseOs,
  type InstallableService, type Recipe, type RemoteOs,
} from './install-recipes';

export type InstallStepId =
  | 'ssh' | 'os' | 'privileges' | 'check' | 'install' | 'start' | 'stop' | 'remove' | 'cleanup' | 'verify' | 'access';
export type InstallStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type InstallMode = 'install' | 'uninstall';

export interface InstallStep {
  id: InstallStepId;
  label: string;
  status: InstallStepStatus;
  detail?: string;
}

const LABELS: Record<InstallStepId, string> = {
  ssh: 'Conexión SSH',
  os: 'Sistema operativo',
  privileges: 'Privilegios',
  check: 'Instalación existente',
  install: 'Instalar paquetes',
  start: 'Iniciar y habilitar el servicio',
  stop: 'Detener y deshabilitar el servicio',
  remove: 'Desinstalar paquetes',
  cleanup: 'Borrar configuración, registros y restos',
  verify: 'Comprobar',
  access: 'Datos de conexión',
};

export interface ServiceInstallResult {
  ok: boolean;
  mode: InstallMode;
  service: string;
  steps: InstallStep[];
  os: { name: string; packageManager: string | null } | null;
  version: string | null;
  /** Instalar: ya estaba y solo se aseguró que estuviera en marcha. Desinstalar: no estaba. */
  alreadyInstalled: boolean;
  /** Datos para usarlo (VPN): enlace para vincular la cuenta, textos y una clave pública. */
  access?: { url: string | null; info: string[]; key: string | null };
  error?: { code: string; message: string; detail?: string };
}

export interface ServiceStatus {
  service: string;
  installed: boolean;
  /** En un grupo (Kubernetes): cuál está instalado. */
  variant: string | null;
  version: string | null;
  os: { name: string; packageManager: string | null };
  /** En un grupo: las opciones y si este sistema las admite. */
  options?: { id: string; label: string; supported: boolean; reason: string | null }[];
  /** Servicio suelto que este sistema no admite (sin AVX, versión sin paquetes…): el motivo. */
  unsupported?: string | null;
}

/* apt update + install puede tardar varios minutos en un servidor lento. */
const LONG_TIMEOUT_MS = 10 * 60_000;
const SHORT_TIMEOUT_MS = 30_000;
/* Lo que sobra de la salida de un gestor de paquetes no hace falta guardarlo. */
const MAX_OUTPUT_BYTES = 256 * 1024;

const lastLines = (r: SSHExecResult, n = 6) =>
  `${r.stderr}\n${r.stdout}`.trim().split('\n').filter(Boolean).slice(-n).join('\n').slice(0, 800);

const cleanVersion = (out: string) =>
  out.split('\n').map(l => l.trim()).find(Boolean)?.replace(/^nginx version:\s*/i, '').slice(0, 120) || null;

const recipeOf = (key: InstallableService): Recipe => INSTALLABLE[key];

/**
 * Instala o desinstala por completo un servicio del catálogo por SSH. Detecta
 * el sistema y el gestor de paquetes, pide privilegios con la misma escalera
 * que Docker y los servicios, y avisa cada paso por el socket del panel
 * (`service:install:progress`); el resultado completo vuelve además en la
 * respuesta.
 */
@Injectable()
export class ServiceInstallService {
  private readonly logger = new Logger(ServiceInstallService.name);
  /* Una operación a la vez por servidor: dos gestores de paquetes simultáneos se bloquean entre sí. */
  private readonly running = new Set<string>();

  constructor(
    private readonly sshService: SSHService,
    private readonly serversService: ServersService,
    private readonly serviceControl: ServiceControlService,
    private readonly gateway: AgentGateway,
  ) {}

  /**
   * ¿Está instalado? Sin privilegios: decide si el panel ofrece instalar o
   * desinstalar. Con un grupo (`kubernetes`) mira todas sus opciones y dice
   * cuál hay y cuáles admite este sistema.
   */
  async status(serverId: string, userId: string, service: string): Promise<ServiceStatus> {
    const keys: InstallableService[] = isInstallGroup(service) ? [...INSTALL_GROUPS[service]] : [this.assertService(service)];
    const server = await this.serversService.findOneWithPrivateKey(serverId, userId);
    let conn: SSHClient | null = null;
    try {
      conn = await this.sshService.createDedicatedClient(server);
      const os = await this.detectOs(conn);
      const exec = (cmd: string) => this.sshService.execOnClient(conn!, cmd, { timeoutMs: SHORT_TIMEOUT_MS });
      let found: { key: InstallableService; version: string | null } | null = null;
      for (const key of keys) {
        const plan = recipeOf(key).plan(os);
        if (plan && (await exec(plan.check)).code === 0) {
          found = { key, version: cleanVersion(`${(await exec(plan.version)).stdout}`) };
          break;
        }
      }
      return {
        service,
        installed: Boolean(found),
        variant: isInstallGroup(service) ? found?.key ?? null : null,
        version: found?.version ?? null,
        os: { name: os.name, packageManager: os.pm },
        unsupported: isInstallGroup(service) ? undefined
          : !os.pm ? `No se reconoce el gestor de paquetes de ${os.name}.` : recipeOf(keys[0]).supports?.(os) ?? null,
        options: isInstallGroup(service)
          ? keys.map(key => {
            const recipe = recipeOf(key);
            const reason = !os.pm ? `No se reconoce el gestor de paquetes de ${os.name}.` : recipe.supports?.(os) ?? null;
            return { id: key, label: recipe.label, supported: !reason, reason };
          })
          : undefined,
      };
    } finally {
      conn?.end();
    }
  }

  install(serverId: string, userId: string, service: string, sudoPassword?: string) {
    return this.operate('install', serverId, userId, service, sudoPassword);
  }

  uninstall(serverId: string, userId: string, service: string, sudoPassword?: string) {
    return this.operate('uninstall', serverId, userId, service, sudoPassword);
  }

  private assertService(service: string): InstallableService {
    if (!isInstallable(service)) {
      throw new BadRequestException({ code: 'NOT_INSTALLABLE', message: `La instalación de «${service}» todavía no está disponible.` });
    }
    return service;
  }

  private async detectOs(conn: SSHClient): Promise<RemoteOs> {
    return parseOs((await this.sshService.execOnClient(conn, DETECT_OS_COMMAND, { timeoutMs: SHORT_TIMEOUT_MS })).stdout);
  }

  private async operate(
    mode: InstallMode, serverId: string, userId: string, service: string, sudoPassword?: string,
  ): Promise<ServiceInstallResult> {
    const key = this.assertService(service);
    if (this.running.has(serverId)) {
      throw new BadRequestException({ code: 'INSTALL_IN_PROGRESS', message: 'Ya hay una instalación o desinstalación en curso en este servidor.' });
    }

    const server = await this.serversService.findOneWithPrivateKey(serverId, userId);
    const recipe = recipeOf(key);
    const steps = new Map<InstallStepId, InstallStep>();
    let current: InstallStepId | null = null;
    let os: RemoteOs | null = null;
    let plan: ReturnType<Recipe['plan']> = null;
    const set = (id: InstallStepId, status: InstallStepStatus, detail?: string) => {
      const label = id === 'access' && plan?.access ? plan.access.label : LABELS[id];
      const step: InstallStep = { id, label, status, detail };
      steps.set(id, step);
      if (status === 'running') current = id;
      this.gateway.emitToOwner(server.ownerId, 'service:install:progress', { serverId, service: key, mode, step });
    };
    const result = (extra: Partial<ServiceInstallResult>): ServiceInstallResult => ({
      ok: false, mode, service: key, steps: [...steps.values()], version: null, alreadyInstalled: false,
      os: os ? { name: os.name, packageManager: os.pm } : null, ...extra,
    });
    const fail = (code: string, message: string, detail?: string) => {
      if (current && steps.get(current)?.status === 'running') set(current, 'failed', detail?.split('\n').pop());
      return result({ error: { code, message, detail } });
    };

    this.running.add(serverId);
    let conn: SSHClient | null = null;
    try {
      set('ssh', 'running');
      conn = await this.sshService.createDedicatedClient(server);
      set('ssh', 'done', `${server.username}@${server.host}`);

      set('os', 'running');
      os = await this.detectOs(conn);
      /* Primero el motivo concreto (systemd, AVX, versión del sistema…), luego el genérico. */
      const unsupported = mode === 'install' && os.pm ? recipe.supports?.(os) : null;
      if (unsupported) return fail('UNSUPPORTED_OS', unsupported);
      plan = recipe.plan(os);
      const removal = recipe.uninstall(os);
      if (!plan || !removal) {
        return fail('UNSUPPORTED_OS', `No se reconoce el gestor de paquetes de ${os.name}.`, 'Se buscan apt, dnf, yum, zypper, apk y pacman.');
      }
      set('os', 'done', `${os.name} · ${os.pm}${os.init !== 'unknown' ? ` · ${os.init}` : ''}`);

      /* SUDO_REQUIRED / SUDO_PASSWORD salen como error HTTP: el panel pide la contraseña y reintenta. */
      set('privileges', 'running');
      let sudo: SudoStrategy;
      try {
        sudo = await this.serviceControl.resolveSudo(conn, server, sudoPassword);
      } catch (err) {
        set('privileges', 'failed', 'hace falta la contraseña de sudo');
        throw err;
      }
      set('privileges', 'done', sudo.kind === 'root' ? 'root' : 'sudo');
      const run = (command: string, timeoutMs = SHORT_TIMEOUT_MS) =>
        this.serviceControl.run(conn!, sudo, command, timeoutMs, { maxOutputBytes: MAX_OUTPUT_BYTES });

      set('check', 'running');
      const already = (await run(plan.check)).code === 0;
      const version = already ? cleanVersion((await run(plan.version)).stdout) : null;
      set('check', 'done', already ? `${recipe.label} ${version ?? ''} instalado`.replace(/\s+/g, ' ') : 'no está instalado');

      if (mode === 'install') {
        /* Dos distribuciones de Kubernetes en el mismo nodo chocan (puertos, CNI, kubelet). */
        if (recipe.group) {
          for (const other of INSTALL_GROUPS[recipe.group].filter(k => k !== key)) {
            const otherPlan = recipeOf(other).plan(os);
            if (otherPlan && (await run(otherPlan.check)).code === 0) {
              return fail('OTHER_INSTALLED', `${recipeOf(other).label} ya está instalado: desinstálalo antes de instalar ${recipe.label}.`);
            }
          }
        }
        if (already) {
          set('install', 'skipped', 'ya instalado');
        } else {
          set('install', 'running', os.pm ?? undefined);
          /* La IP del panel tal como la ve el servidor (fail2ban la pone en su lista blanca). */
          let clientIp = '';
          if (plan.install.some(c => c.includes(SSH_CLIENT_IP))) {
            const out = (await this.sshService.execOnClient(conn, 'echo "${SSH_CONNECTION%% *}"', { timeoutMs: SHORT_TIMEOUT_MS })).stdout.trim();
            clientIp = /^[0-9a-fA-F:.]{2,45}$/.test(out) ? out : '';
          }
          for (const command of plan.install.map(c => c.split(SSH_CLIENT_IP).join(clientIp))) {
            const r = await run(command, LONG_TIMEOUT_MS);
            if (r.code !== 0) {
              this.logger.warn(`Instalar ${key} en ${server.host} falló (${command}): ${lastLines(r)}`);
              return fail('INSTALL_FAILED', `No se pudo instalar ${recipe.label} con ${os.pm}.`, lastLines(r));
            }
          }
          set('install', 'done', `paquete instalado con ${os.pm}`);
        }

        if (plan.start) {
          set('start', 'running');
          const r = await run(plan.start, plan.startTimeoutMs ?? SHORT_TIMEOUT_MS * 2);
          if (r.code !== 0) {
            const logs = plan.logs ? lastLines(await run(plan.logs), 8) : '';
            return fail('START_FAILED', `${recipe.label} se instaló pero no arrancó.`,
              [lastLines(r), logs].filter(Boolean).join('\n') || 'Revisa si otro servicio usa el mismo puerto.');
          }
          set('start', 'done', plan.startDetail ?? 'arranca con el sistema');
        } else {
          set('start', 'skipped', plan.noService ? 'no se ejecuta como servicio' : 'sistema de arranque no reconocido');
        }

        set('verify', 'running');
        const installedVersion = cleanVersion((await run(plan.version)).stdout);
        const up = plan.running ? (await run(plan.running)).code === 0 : true;
        if (!up) return fail('NOT_RUNNING', `${recipe.label} está instalado pero no está en marcha.`);
        set('verify', 'done', installedVersion || 'en marcha');

        /* VPN: el enlace para vincular la cuenta o los datos de la interfaz. No hacer de esto un fallo: ya está instalado y en marcha. */
        let access: ServiceInstallResult['access'];
        if (plan.access) {
          set('access', 'running');
          const lines = (await run(plan.access.command, SHORT_TIMEOUT_MS)).stdout.split('\n').map(l => l.trim());
          const pick = (prefix: string) => lines.filter(l => l.startsWith(prefix)).map(l => l.slice(prefix.length).trim()).filter(Boolean);
          access = { url: pick('URL:')[0] ?? null, info: pick('INFO:'), key: pick('KEY:')[0] ?? null };
          set('access', 'done', access.url ? 'abre el enlace para vincular' : access.info[0]);
        }

        this.logger.log(`📦 ${recipe.label} ${already ? 'ya estaba' : 'instalado'} en ${server.name} (${server.host})`);
        return result({ ok: true, version: installedVersion, alreadyInstalled: already, access });
      }

      /* ── Desinstalación completa: paquetes, configuración, registros, usuario. ── */
      /* Sin sudo, para ver la sesión SSH tal cual (sudo limpia SSH_CONNECTION). */
      if (removal.guard) {
        const blocked = (await this.sshService.execOnClient(conn, removal.guard, { timeoutMs: SHORT_TIMEOUT_MS })).stdout
          .split('\n').map(l => l.trim()).find(l => l.startsWith('BLOCK:'));
        if (blocked) return fail('UNSAFE_UNINSTALL', blocked.slice(6));
      }
      if (removal.stop) {
        set('stop', 'running');
        await run(removal.stop, SHORT_TIMEOUT_MS * 2);
        set('stop', 'done');
      } else {
        set('stop', 'skipped', 'sistema de arranque no reconocido');
      }

      set('remove', 'running', os.pm ?? undefined);
      for (const command of removal.remove) {
        const r = await run(command, LONG_TIMEOUT_MS);
        if (r.code !== 0) {
          this.logger.warn(`Desinstalar ${key} en ${server.host} falló (${command}): ${lastLines(r)}`);
          return fail('UNINSTALL_FAILED', `No se pudo desinstalar ${recipe.label} con ${os.pm}.`, lastLines(r));
        }
      }
      set('remove', 'done', already ? `paquetes quitados con ${os.pm}` : 'no había paquetes');

      set('cleanup', 'running');
      await run(removal.cleanup, SHORT_TIMEOUT_MS * 2);
      set('cleanup', 'done');

      set('verify', 'running');
      const left = (await run(removal.residue)).stdout
        .split('\n').map(l => l.trim()).filter(l => l.startsWith('LEFT:')).map(l => l.slice(5));
      const stillThere = (await run(plan.check)).code === 0;
      if (stillThere || left.length > 0) {
        return fail('RESIDUE_LEFT', `Quedaron restos de ${recipe.label} en el servidor.`,
          [stillThere ? 'el ejecutable sigue instalado' : '', ...left].filter(Boolean).join('\n'));
      }
      set('verify', 'done', 'sin rastro en el servidor');

      this.logger.log(`🧹 ${recipe.label} desinstalado por completo de ${server.name} (${server.host})`);
      return result({ ok: true, version, alreadyInstalled: already });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`${mode === 'install' ? 'Instalar' : 'Desinstalar'} ${key} en ${server.host}: ${message}`);
      return fail(mode === 'install' ? 'INSTALL_ERROR' : 'UNINSTALL_ERROR',
        `No se pudo completar la ${mode === 'install' ? 'instalación' : 'desinstalación'} de ${recipe.label}.`, message);
    } finally {
      this.running.delete(serverId);
      conn?.end();
    }
  }
}
