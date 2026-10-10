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

/** Tope del resumen de datos que se adjunta a cada pregunta. */
const MAX_SNAPSHOT_CHARS = 60_000;
const take = <T>(list: unknown, n: number): T[] => (Array.isArray(list) ? (list.slice(0, n) as T[]) : []);

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

  async snapshot(userId: string): Promise<string> {
    const servers = await this.servers.find({
      where: { ownerId: userId },
      select: {
        id: true, name: true, host: true, port: true, username: true, status: true, os: true,
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
        take: 30,
      }),
      this.connections.find({
        where: { userId },
        select: {
          id: true, name: true, engine: true, host: true, port: true, username: true, database: true,
          status: true, version: true, lastError: true, lastCheckedAt: true,
        },
        order: { name: 'ASC' },
      }),
      this.notifications.find({
        where: { userId },
        select: { serverId: true, type: true, severity: true, title: true, body: true, read: true, createdAt: true },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    const connIds = connections.map(c => c.id);
    const connNames = new Map(connections.map(c => [c.id, c.name]));
    const queries = connIds.length
      ? await this.queries.find({
          where: { userId, connectionId: In(connIds) },
          select: { connectionId: true, schema: true, query: true, reason: true, status: true, affectedRows: true, error: true, createdAt: true },
          order: { createdAt: 'DESC' },
          take: 20,
        })
      : [];

    const metricsBy = new Map(metrics.map(m => [m.server_id, m]));

    const data = {
      servidores: servers.map(s => {
        const m = metricsBy.get(s.id);
        return {
          id: s.id,
          nombre: s.name,
          host: s.host,
          puerto: s.port,
          usuarioSsh: s.username,
          estado: s.status,
          so: s.os,
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
        id: c.id,
        nombre: c.name,
        motor: c.engine,
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

    let json = redactSecrets(JSON.stringify(stripSensitiveKeys(data)));
    if (json.length > MAX_SNAPSHOT_CHARS) {
      /* Sin métricas detalladas cabe casi siempre; si no, se corta y se avisa. */
      const lean = {
        ...data,
        servidores: data.servidores.map(s => ({ ...s, metricas: s.metricas ? { ...s.metricas, procesos: undefined, servicios: { ...s.metricas.servicios, lista: undefined }, sitiosWeb: undefined, basesDetectadas: undefined } : null })),
      };
      json = redactSecrets(JSON.stringify(stripSensitiveKeys(lean)));
      if (json.length > MAX_SNAPSHOT_CHARS) json = `${json.slice(0, MAX_SNAPSHOT_CHARS)}… [recortado]`;
    }
    return json;
  }
}
