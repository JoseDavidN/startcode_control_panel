import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Server } from '@servers/entities/server.entity';
import { AgentMetrics } from '@monitoring/entities/agent-metrics.entity';
import { CommandAudit } from '@monitoring/entities/command-audit.entity';
import { DatabaseConnection } from '@/databases/entities/database-connection.entity';
import { DatabaseQueryAudit } from '@/databases/entities/database-query-audit.entity';
import { Notification } from '@/notifications/entities/notification.entity';
import { redactSecrets, stripSensitiveKeys } from './secret-redactor';
import { hidePanelInternals } from './panel-guard';
import { systemTraits, titleTarget } from './target-system';
import { DatabaseEngine } from '@/databases/entities/database-connection.entity';

/** Lo adjuntado que dice a qué servidor o base se refiere la pregunta. */
export interface DestinationItem {
  type: string;
  title: string;
  database?: { connectionId: string; schema?: string };
}

const ENGINE_LABELS: Record<DatabaseEngine, string> = {
  [DatabaseEngine.MYSQL]: 'MySQL',
  [DatabaseEngine.MARIADB]: 'MariaDB',
  [DatabaseEngine.POSTGRESQL]: 'PostgreSQL',
  [DatabaseEngine.REDIS]: 'Redis',
};
/* Títulos de las fuentes de bases de datos (los demás son de servidores). */
const DB_TITLES = /^(Editor SQL|Resultado SQL|Estructura|Consola Redis) · /;

/** Tope del resumen de datos que se adjunta a cada pregunta (~7500 tokens). */
const MAX_SNAPSHOT_CHARS = 30_000;
const take = <T>(list: unknown, n: number): T[] => (Array.isArray(list) ? (list.slice(0, n) as T[]) : []);

/* Cada pregunta paga estos datos en tokens: sin nulos, vacíos ni ids, que el modelo no usa. */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const p = prune(v);
      if (p === null || p === undefined || p === '' || (Array.isArray(p) && !p.length)) continue;
      if (typeof p === 'object' && !Array.isArray(p) && !(p instanceof Date) && !Object.keys(p).length) continue;
      out[k] = p;
    }
    return out;
  }
  return value;
}

/** El servidor aparece (nombre, host o hostname) en la pregunta o en lo que hay en pantalla. */
function mentions(focus: string, s: { name: string; host: string; hostname: string | null }): boolean {
  return [s.name, s.host, s.hostname]
    .filter((t): t is string => Boolean(t) && t!.length >= 3)
    .some(t => focus.includes(t.toLowerCase()));
}

/**
 * Resumen de los datos del panel que pertenecen a un usuario, para el asistente.
 *
 * Todo se filtra por `userId`: servidores propios (y sus métricas),
 * conexiones a bases, auditorías y notificaciones de esa cuenta. Las
 * columnas se eligen una a una —nunca la entidad entera— para que ni la
 * llave SSH (`privateKey`) ni la contraseña cifrada (`passwordEnc`) puedan
 * colarse aunque una consulta futura las seleccione. Encima va
 * `stripSensitiveKeys` y `redactSecrets` como segunda barrera.
 */
@Injectable()
export class AssistantContextService {
  constructor(
    @InjectRepository(Server) private readonly servers: Repository<Server>,
    @InjectRepository(AgentMetrics) private readonly metrics: Repository<AgentMetrics>,
    @InjectRepository(CommandAudit) private readonly commands: Repository<CommandAudit>,
    @InjectRepository(DatabaseConnection) private readonly connections: Repository<DatabaseConnection>,
    @InjectRepository(DatabaseQueryAudit) private readonly queries: Repository<DatabaseQueryAudit>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  /**
   * `focus`: la pregunta y los títulos de lo adjuntado. Solo los servidores
   * nombrados ahí (o el único, si hay uno) llevan las métricas completas; el
   * resto, una línea con su estado. Así una pregunta sobre un servidor no
   * paga los servicios y procesos de todos los demás.
   */
  /**
   * Para qué sistema o motor hay que escribir: una línea por servidor o base
   * abiertos en pantalla (por el título de la fuente) o nombrados en la
   * pregunta, con su distribución, versión, gestor de paquetes y arranque, o
   * su motor y versión. Así el asistente no da `apt` en Rocky ni `LIMIT` en
   * una consulta que no lo admite.
   */
  async destinations(userId: string, items: DestinationItem[], question: string): Promise<string> {
    const [servers, connections] = await Promise.all([
      this.servers.find({
        where: { ownerId: userId },
        select: { id: true, name: true, host: true, hostname: true, os: true, osVersion: true, kernelVersion: true },
      }),
      this.connections.find({ where: { userId }, select: { id: true, name: true, engine: true, version: true, database: true } }),
    ]);
    const lowered = question.toLowerCase();
    const serverIds = new Set<string>();
    const connIds = new Map<string, string | undefined>();

    for (const item of items) {
      const name = titleTarget(item.title);
      if (item.database?.connectionId) connIds.set(item.database.connectionId, item.database.schema);
      else if (DB_TITLES.test(item.title)) {
        const conn = connections.find(c => c.name === name);
        if (conn) connIds.set(conn.id, undefined);
      } else if (item.type === 'terminal' || item.type === 'command_output') {
        const server = servers.find(sv => sv.name === name);
        if (server) serverIds.add(server.id);
      }
    }
    for (const sv of servers) if (mentions(lowered, sv)) serverIds.add(sv.id);
    for (const c of connections) if (c.name.length >= 3 && lowered.includes(c.name.toLowerCase())) connIds.set(c.id, connIds.get(c.id));

    const metrics = serverIds.size
      ? await this.metrics.find({
          where: { server_id: In([...serverIds]) },
          select: { server_id: true, system_distro: true, system_platform: true, system_kernel: true, system_arch: true },
        })
      : [];
    const metricsBy = new Map(metrics.map(m => [m.server_id, m]));

    const lines: string[] = [];
    for (const sv of servers.filter(x => serverIds.has(x.id))) {
      const m = metricsBy.get(sv.id);
      const distro = m?.system_distro || sv.osVersion || null;
      const traits = systemTraits(distro, sv.osVersion, sv.os);
      const parts = [
        distro ?? `${sv.os} (versión sin confirmar)`,
        m?.system_kernel || sv.kernelVersion ? `kernel ${m?.system_kernel || sv.kernelVersion}` : null,
        m?.system_arch ?? null,
        traits.packages ? `paquetes: ${traits.packages}` : 'gestor de paquetes desconocido',
        traits.init ? `servicios: ${traits.init}` : null,
      ].filter(Boolean);
      lines.push(`- Servidor «${sv.name}»: ${parts.join(', ')}${m ? '' : ' (sin datos del agente: confírmalo con cat /etc/os-release)'}`);
    }
    for (const c of connections.filter(x => connIds.has(x.id))) {
      const schema = connIds.get(c.id) ?? c.database;
      lines.push(`- Base «${c.name}»: ${ENGINE_LABELS[c.engine]} ${c.version ?? '(versión sin confirmar)'}${schema ? `, base ${c.engine === DatabaseEngine.REDIS ? `db${schema}` : schema}` : ''}`);
    }
    return hidePanelInternals(redactSecrets(lines.join('\n')));
  }

  async snapshot(userId: string, focus = ''): Promise<string> {
    const servers = await this.servers.find({
      where: { ownerId: userId },
      select: {
        id: true, name: true, host: true, port: true, username: true, status: true, os: true, tag: true,
        description: true, lastSeen: true, hostname: true, osVersion: true, kernelVersion: true,
        metadata: true, createdAt: true,
      },
      order: { name: 'ASC' },
    });
    const serverIds = servers.map(s => s.id);
    const names = new Map(servers.map(s => [s.id, s.name]));

    const [metrics, commands, connections, notifications] = await Promise.all([
      serverIds.length ? this.metrics.find({ where: { server_id: In(serverIds) } }) : Promise.resolve([]),
      this.commands.find({
        where: { userId },
        select: { serverId: true, command: true, sudo: true, status: true, exitCode: true, durationMs: true, createdAt: true },
        order: { createdAt: 'DESC' },
        take: 15,
      }),
      this.connections.find({
        where: { userId },
        select: {
          id: true, name: true, engine: true, tag: true, host: true, port: true, username: true, database: true,
          status: true, version: true, lastError: true, lastCheckedAt: true,
        },
        order: { name: 'ASC' },
      }),
      this.notifications.find({
        where: { userId },
        select: { serverId: true, type: true, severity: true, title: true, body: true, read: true, createdAt: true },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const connIds = connections.map(c => c.id);
    const connNames = new Map(connections.map(c => [c.id, c.name]));
    const queries = connIds.length
      ? await this.queries.find({
          where: { userId, connectionId: In(connIds) },
          select: { connectionId: true, schema: true, query: true, reason: true, status: true, affectedRows: true, error: true, createdAt: true },
          order: { createdAt: 'DESC' },
          take: 10,
        })
      : [];

    const metricsBy = new Map(metrics.map(m => [m.server_id, m]));
    const lowered = focus.toLowerCase();
    const focused = new Set(
      servers.length === 1 ? [servers[0].id] : servers.filter(s => mentions(lowered, s)).map(s => s.id),
    );

    const data = {
      ...(servers.length > focused.size
        ? { nota: 'Servidores sin métricas completas: si preguntan por uno, que lo nombren.' }
        : {}),
      servidores: servers.map(s => {
        const m = metricsBy.get(s.id);
        if (!focused.has(s.id)) {
          const disks = Array.isArray(m?.disk_filesystems) ? m.disk_filesystems : [];
          return {
            nombre: s.name,
            host: s.host,
            estado: s.status,
            so: s.os,
            etiqueta: s.tag,
            agente: s.metadata?.agent?.state,
            metricas: m
              ? {
                  instante: m.timestamp,
                  cpuPct: m.cpu_usage,
                  memoriaPct: m.memory_usage_percent,
                  discoMaxPct: disks.length ? Math.max(...disks.map(d => d.usagePercent ?? 0)) : undefined,
                  carga1m: m.cpu_load_average_1m,
                  serviciosFallidos: m.services_failed,
                }
              : null,
          };
        }
        return {
          nombre: s.name,
          host: s.host,
          puerto: s.port,
          usuarioSsh: s.username,
          estado: s.status,
          so: s.os,
          etiqueta: s.tag,
          descripcion: s.description,
          hostname: s.hostname,
          versionSo: s.osVersion,
          kernel: s.kernelVersion,
          ultimaConexion: s.lastSeen,
          agente: s.metadata?.agent
            ? { estado: s.metadata.agent.state, version: s.metadata.agent.version, arquitectura: s.metadata.agent.arch }
            : null,
          serviciosFijados: s.metadata?.pinnedServices ?? [],
          metricas: m
            ? {
                instante: m.timestamp,
                cpu: { uso: m.cpu_usage, nucleos: m.cpu_cores, modelo: m.cpu_brand, carga: [m.cpu_load_average_1m, m.cpu_load_average_5m, m.cpu_load_average_15m] },
                memoria: { usoPct: m.memory_usage_percent, total: m.memory_total, usada: m.memory_used, disponible: m.memory_available },
                swap: { usoPct: m.swap_usage_percent, total: m.swap_total },
                discos: m.disk_filesystems as unknown,
                red: { ipPublica: m.network_public_ip, ipsPrivadas: m.network_private_ips, conexionesActivas: m.network_connections_active, escuchando: m.network_connections_listening },
                sistema: { distro: m.system_distro, plataforma: m.system_platform, kernel: m.system_kernel, arquitectura: m.system_arch, uptimeSeg: m.system_uptime },
                procesos: { total: m.processes_total, ejecutando: m.processes_running, zombie: m.processes_zombie, top: take(m.processes_top_list, 10) },
                servicios: { total: m.services_count, activos: m.services_active, fallidos: m.services_failed, lista: take(m.services_list, 60) },
                sitiosWeb: take(m.websites_list, 30),
                basesDetectadas: take(m.databases_list, 30),
                versionAgente: m.agent_version,
              }
            : null,
        };
      }),
      conexionesBaseDeDatos: connections.map(c => ({
        nombre: c.name,
        motor: c.engine,
        etiqueta: c.tag,
        host: c.host,
        puerto: c.port,
        usuario: c.username,
        base: c.database,
        estado: c.status,
        version: c.version,
        ultimoError: c.lastError,
        ultimaComprobacion: c.lastCheckedAt,
      })),
      ultimosComandos: commands.map(c => ({
        servidor: names.get(c.serverId) ?? c.serverId,
        comando: c.command,
        sudo: c.sudo,
        estado: c.status,
        codigoSalida: c.exitCode,
        duracionMs: c.durationMs,
        fecha: c.createdAt,
      })),
      consultasPeligrosasConfirmadas: queries.map(q => ({
        conexion: connNames.get(q.connectionId) ?? q.connectionId,
        base: q.schema,
        consulta: q.query,
        motivo: q.reason,
        estado: q.status,
        filasAfectadas: q.affectedRows,
        error: q.error,
        fecha: q.createdAt,
      })),
      notificacionesRecientes: notifications.map(n => ({
        servidor: n.serverId ? (names.get(n.serverId) ?? n.serverId) : null,
        tipo: n.type,
        severidad: n.severity,
        titulo: n.title,
        detalle: n.body,
        leida: n.read,
        fecha: n.createdAt,
      })),
    };

    let json = redactSecrets(JSON.stringify(prune(stripSensitiveKeys(data))));
    if (json.length > MAX_SNAPSHOT_CHARS) {
      /* Sin métricas detalladas cabe casi siempre; si no, se corta y se avisa. */
      const lean = {
        ...data,
        servidores: data.servidores.map(s => ({ ...s, metricas: s.metricas ? { ...s.metricas, procesos: undefined, servicios: { ...s.metricas.servicios, lista: undefined }, sitiosWeb: undefined, basesDetectadas: undefined } : null })),
      };
      json = redactSecrets(JSON.stringify(prune(stripSensitiveKeys(lean))));
      if (json.length > MAX_SNAPSHOT_CHARS) json = `${json.slice(0, MAX_SNAPSHOT_CHARS)}… [recortado]`;
    }
    /* Los procesos y comandos de los servidores pueden mostrar dónde corre el propio panel. */
    return hidePanelInternals(json);
  }
}
