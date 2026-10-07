import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Client as SSHClient } from 'ssh2';
import { ServersService } from '@servers/servers.service';
import { SSHService, SSHExecResult } from './ssh.service';
import { ServiceControlService, SudoStrategy } from './service-control.service';

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  command: string;
  createdAt: string;
  /** "2 hours ago": lo que pinta `docker ps`. */
  runningFor: string;
  /** "Up 2 hours (healthy)". */
  status: string;
  state: string;
  ports: string[];
  networks: string[];
  mounts: string[];
  /** Proyecto de docker compose, si lo hay. */
  composeProject: string | null;
  composeService: string | null;
  stats: {
    cpuPercent: number;
    memPercent: number;
    /** "120MiB / 1.94GiB" tal cual lo da docker. */
    memUsage: string;
    netIO: string;
    blockIO: string;
    pids: number;
  } | null;
}

export interface DockerContainersResult {
  containers: DockerContainer[];
  /** Momento de la lectura: la lista es una foto, no tiempo real. */
  readAt: string;
}

const EXEC_TIMEOUT_MS = 30_000;

/* `{{json .}}` da una línea JSON por contenedor: se parsea sin depender del
   ancho de columnas de la salida tabular. */
const PS_COMMAND = "docker ps --no-trunc --format '{{json .}}'";
const STATS_COMMAND = "docker stats --no-stream --no-trunc --format '{{json .}}'";

type Raw = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const list = (value: unknown): string[] =>
  str(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

const percent = (value: unknown): number => {
  const parsed = parseFloat(str(value).replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** "a=1,b=2" → Map. Los valores de las etiquetas pueden llevar `=`. */
const labels = (value: unknown): Map<string, string> => {
  const map = new Map<string, string>();
  for (const pair of list(value)) {
    const separator = pair.indexOf('=');
    if (separator > 0) map.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return map;
};

const parseLines = (stdout: string): Raw[] =>
  stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as Raw];
      } catch {
        return [];
      }
    });

@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);

  constructor(
    private readonly sshService: SSHService,
    private readonly serversService: ServersService,
    private readonly serviceControl: ServiceControlService,
  ) {}

  /**
   * Contenedores en ejecución con su consumo. Se intenta sin sudo —con el
   * usuario en el grupo `docker` basta— y solo se escala si el socket se niega.
   */
  async listContainers(
    serverId: string,
    userId: string,
    sudoPassword?: string,
  ): Promise<DockerContainersResult> {
    const server = await this.serversService.findOneWithPrivateKey(serverId, userId);

    let conn: SSHClient | null = null;
    try {
      conn = await this.sshService.createDedicatedClient(server);

      let sudo: SudoStrategy | null = null;
      let ps = await this.exec(conn, null, PS_COMMAND);

      if (ps.code !== 0 && /permission denied/i.test(ps.stderr)) {
        sudo = await this.serviceControl.resolveSudo(conn, server, sudoPassword);
        ps = await this.exec(conn, sudo, PS_COMMAND);
      }

      if (ps.code !== 0) {
        this.logger.warn(`docker ps falló en ${server.host}: ${ps.stderr.trim()}`);
        throw new ServiceUnavailableException({
          code: 'DOCKER_UNAVAILABLE',
          message: /not found/i.test(ps.stderr)
            ? `Docker no está instalado en ${server.host}.`
            : `El daemon de Docker no responde en ${server.host}.`,
          hint: ps.stderr.trim().slice(0, 300) || undefined,
        });
      }

      const rows = parseLines(ps.stdout);

      /* Sin contenedores no hace falta `docker stats`, que tarda ~2 s. */
      const stats = rows.length > 0 ? await this.exec(conn, sudo, STATS_COMMAND) : null;
      const statsById = new Map<string, Raw>();
      for (const row of stats?.code === 0 ? parseLines(stats.stdout) : []) {
        statsById.set(str(row.ID), row);
      }

      return {
        containers: rows.map(row => this.toContainer(row, statsById)),
        readAt: new Date().toISOString(),
      };
    } finally {
      conn?.end();
    }
  }

  private exec(conn: SSHClient, sudo: SudoStrategy | null, command: string): Promise<SSHExecResult> {
    return sudo
      ? this.serviceControl.run(conn, sudo, command, EXEC_TIMEOUT_MS)
      : this.sshService.execOnClient(conn, command, { timeoutMs: EXEC_TIMEOUT_MS });
  }

  private toContainer(row: Raw, statsById: Map<string, Raw>): DockerContainer {
    const id = str(row.ID);
    const tags = labels(row.Labels);
    /* `docker stats --no-trunc` da el ID completo; `docker ps --no-trunc` también. */
    const stat = statsById.get(id) ?? statsById.get(id.slice(0, 12));

    return {
      id: id.slice(0, 12),
      name: str(row.Names),
      image: str(row.Image),
      command: str(row.Command).replace(/^"|"$/g, ''),
      createdAt: str(row.CreatedAt),
      runningFor: str(row.RunningFor),
      status: str(row.Status),
      state: str(row.State) || 'running',
      ports: list(row.Ports),
      networks: list(row.Networks),
      mounts: list(row.Mounts),
      composeProject: tags.get('com.docker.compose.project') ?? null,
      composeService: tags.get('com.docker.compose.service') ?? null,
      stats: stat
        ? {
            cpuPercent: percent(stat.CPUPerc),
            memPercent: percent(stat.MemPerc),
            memUsage: str(stat.MemUsage),
            netIO: str(stat.NetIO),
            blockIO: str(stat.BlockIO),
            pids: Number(str(stat.PIDs)) || 0,
          }
        : null,
    };
  }
}
