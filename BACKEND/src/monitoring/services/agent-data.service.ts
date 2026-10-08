// src/monitoring/services/agent-data.service.ts
import { Inject, Injectable, NotFoundException, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AgentMetrics } from '../entities/agent-metrics.entity';
import { AgentMetricsHistory } from '../entities/agent-metrics-history.entity';
import { Server } from '@servers/entities/server.entity';
import { AgentGateway } from '../gateways/agent.gateway';
import {
  AccountOverviewDto,
  HistoricalMetricsDto,
  MetricPointDto,
  ServerLiveSummaryDto,
  ServerSummaryDto,
  ServersSummaryDto,
  SystemInfoResponseDto,
  AgentConnectionStatusDto,
} from '../dto/agent-data-response.dto';
import { ServicePayload } from '../dto/agent-payload';
import {
  AGENT_STATUS_PROJECTION,
  DASHBOARD_PROJECTION,
  SYSTEM_INFO_PROJECTION,
} from '../dto/metrics-projections';

/** Fila cruda de la consulta agregada de la lista. */
interface ServersSummaryRow {
  serverId: string;
  name: string;
  status: string;
  lastSeen: Date | null;
  lastMetricAt: Date | null;
  cpu: string | null;
  memory: string | null;
  diskFilesystems: unknown;
  uptime: string | null;
  servicesActive: number | null;
  servicesCount: number | null;
  servicesFailed: number | null;
  websites: number | null;
  databases: number | null;
  processes: number | null;
  agentVersion: string | null;
  hasServicesInv: boolean;
  hasWebsitesInv: boolean;
  hasDatabasesInv: boolean;
}

/**
 * Compara nombres de unidad tolerando el sufijo `.service`: el agente guarda
 * lo que devuelve `systemctl list-units` y el panel puede recibir cualquiera
 * de las dos formas.
 */
function sameUnit(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const strip = (unit: string) => unit.replace(/\.service$/, '');
  return strip(a) === strip(b);
}

@Injectable()
export class AgentDataService {
  private readonly logger = new Logger(AgentDataService.name);

  constructor(
    @InjectRepository(AgentMetrics)
    private metricsRepository: Repository<AgentMetrics>,
    @InjectRepository(AgentMetricsHistory)
    private metricsHistoryRepository: Repository<AgentMetricsHistory>,
    @InjectRepository(Server)
    private serversRepository: Repository<Server>,
    /* El gateway usa el helper estático de este servicio y este servicio
       pregunta al gateway qué agentes están conectados: los dos archivos se
       importan mutuamente, así que la inyección tiene que ser perezosa. */
    @Inject(forwardRef(() => AgentGateway))
    private agentGateway: AgentGateway,
  ) {}

  /**
   * Obtiene las últimas métricas de un servidor
   *
   * @param serverId - ID del servidor
   * @returns Últimas métricas guardadas
   */
  async getLatestMetrics(
    serverId: string,
    select?: (keyof AgentMetrics)[],
  ): Promise<AgentMetrics | null> {
    return this.metricsRepository.findOne({
      where: { server_id: serverId },
      order: { timestamp: 'DESC' },
      ...(select && { select }),
    });
  }

  /**
   * Uso del disco "del servidor": el del montaje raíz, con el primer sistema de
   * archivos como último recurso. Es estático a propósito para que el gateway lo
   * use también y el mismo dato no salga distinto en dos sitios de la interfaz.
   */
  static rootDiskUsage(filesystems: unknown): number {
    if (!Array.isArray(filesystems)) return 0;
    const root =
      filesystems.find(
        (f: any) => f?.mount === '/' || f?.mountPoint === '/',
      ) ?? filesystems[0];
    return Number((root as any)?.usagePercent) || 0;
  }

  async getDashboardSummary(serverId: string): Promise<ServerSummaryDto | null> {
    const m = await this.getLatestMetrics(serverId, DASHBOARD_PROJECTION);
    if (!m) return null;

    return {
      serverId,
      timestamp: m.timestamp,
      cpu: Number(m.cpu_usage) || 0,
      memory: Number(m.memory_usage_percent) || 0,
      disk: AgentDataService.rootDiskUsage(m.disk_filesystems),
      connections: m.network_connections_active || 0,
    };
  }

  /**
   * Obtiene métricas históricas de un servidor en un rango de tiempo.
   * Consulta tbl_agent_metrics_history (serie temporal append-only).
   */
  /** Puntos que devuelve una serie histórica, independientemente del rango. */
  private static readonly HISTORY_BUCKETS = 120;

  async getHistoricalMetrics(
    serverId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<HistoricalMetricsDto> {
    /* Se agrega en el servidor: el agente reporta cada pocos segundos, así que
       24 h son decenas de miles de filas por serie. Con 120 cubos la gráfica
       queda igual de legible y la respuesta cabe en unos pocos KB. */
    const spanMs = Math.max(1, endTime.getTime() - startTime.getTime());
    const bucketSeconds = Math.max(
      1,
      Math.round(spanMs / 1000 / AgentDataService.HISTORY_BUCKETS),
    );

    const rows = await this.metricsHistoryRepository
      .createQueryBuilder('h')
      .select(
        `to_timestamp(floor(extract(epoch from h.timestamp) / :bucket) * :bucket)`,
        'bucket',
      )
      .addSelect('AVG(h.cpu_usage)', 'cpu')
      .addSelect('AVG(h.memory_usage_percent)', 'memory')
      .addSelect('AVG(h.disk_usage_percent)', 'disk')
      .addSelect('AVG(h.cpu_load_average_1m)', 'load')
      .addSelect('AVG(h.network_connections_active)', 'connections')
      .where('h.server_id = :serverId', { serverId })
      .andWhere('h.timestamp BETWEEN :startTime AND :endTime', { startTime, endTime })
      .setParameter('bucket', bucketSeconds)
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{
        bucket: Date;
        cpu: string | null;
        memory: string | null;
        disk: string | null;
        load: string | null;
        connections: string | null;
      }>();

    const series = (key: 'cpu' | 'memory' | 'disk' | 'load' | 'connections'): MetricPointDto[] =>
      rows.map((r) => ({
        timestamp: r.bucket,
        value: Math.round((Number(r[key]) || 0) * 100) / 100,
      }));

    return {
      serverId,
      cpu: series('cpu'),
      memory: series('memory'),
      disk: series('disk'),
      loadAverage: series('load'),
      connections: series('connections'),
      startTime,
      endTime,
    };
  }

  /**
   * Agregado de toda la cuenta en una sola consulta. Sin esto, el dashboard
   * tendría que pedir /latest por servidor, que devuelve el JSON completo con
   * listas de procesos y servicios solo para sumar cuatro contadores.
   */
  async getAccountOverview(userId: string): Promise<AccountOverviewDto> {
    const row = await this.metricsRepository
      .createQueryBuilder('m')
      .innerJoin('tbl_servers', 's', 's.id = m.server_id')
      .where('s.str_owner_id = :userId', { userId })
      .select('COUNT(m.server_id)', 'reporting')
      .addSelect('COALESCE(SUM(m.services_count), 0)', 'services')
      .addSelect('COALESCE(SUM(m.websites_count), 0)', 'websites')
      .addSelect('COALESCE(SUM(m.databases_count), 0)', 'databases')
      .addSelect('COALESCE(SUM(m.processes_total), 0)', 'processes')
      .addSelect('AVG(m.cpu_usage)', 'avgCpu')
      .addSelect('AVG(m.memory_usage_percent)', 'avgMemory')
      .addSelect('MAX(m.timestamp)', 'lastReportAt')
      .getRawOne<{
        reporting: string;
        services: string;
        websites: string;
        databases: string;
        processes: string;
        avgCpu: string | null;
        avgMemory: string | null;
        lastReportAt: Date | null;
      }>();

    const servers = await this.metricsRepository.manager
      .getRepository('tbl_servers')
      .count({ where: { ownerId: userId } as any });

    const round = (v: string | null | undefined) =>
      v === null || v === undefined ? 0 : Math.round(Number(v) * 10) / 10;

    return {
      servers,
      reporting: Number(row?.reporting ?? 0),
      services: Number(row?.services ?? 0),
      websites: Number(row?.websites ?? 0),
      databases: Number(row?.databases ?? 0),
      processes: Number(row?.processes ?? 0),
      avgCpu: round(row?.avgCpu),
      avgMemory: round(row?.avgMemory),
      lastReportAt: row?.lastReportAt ?? null,
    };
  }

  /**
   * Estado en vivo de todos los servidores del usuario, en UNA consulta.
   *
   * La lista leía `tbl_servers.json_metadata`, que nadie escribe: por eso
   * enseñaba 0 % eternamente. La fuente correcta es `tbl_agent_metrics`, la
   * misma que ya usan el detalle y el dashboard.
   *
   * `tbl_servers` manda en el JOIN para que los servidores sin métricas
   * aparezcan igual, y `tbl_agent_metrics` tiene `server_id` como clave
   * primaria (una fila por servidor), así que el LEFT JOIN no necesita
   * agrupar.
   */
  async getServersSummary(userId: string): Promise<ServersSummaryDto> {
    const rows = await this.serversRepository
      .createQueryBuilder('s')
      .leftJoin(AgentMetrics, 'm', 'm.server_id = s.id')
      .where('s.ownerId = :userId', { userId })
      .select('s.id', 'serverId')
      .addSelect('s.name', 'name')
      .addSelect('s.status', 'status')
      .addSelect('s.lastSeen', 'lastSeen')
      .addSelect('m.timestamp', 'lastMetricAt')
      .addSelect('m.cpu_usage', 'cpu')
      .addSelect('m.memory_usage_percent', 'memory')
      .addSelect('m.disk_filesystems', 'diskFilesystems')
      .addSelect('m.system_uptime', 'uptime')
      .addSelect('m.services_active', 'servicesActive')
      .addSelect('m.services_count', 'servicesCount')
      .addSelect('m.services_failed', 'servicesFailed')
      .addSelect('m.websites_count', 'websites')
      .addSelect('m.databases_count', 'databases')
      .addSelect('m.processes_total', 'processes')
      .addSelect('m.agent_version', 'agentVersion')
      /* Los contadores valen 0 en cuanto existe la fila, así que sin esto no
         se distingue "ningún sitio web" de "el inventario aún no ha llegado".
         `IS NOT NULL` mira la cabecera de la fila, no deserializa el jsonb. */
      .addSelect('(m.services_list IS NOT NULL)', 'hasServicesInv')
      .addSelect('(m.websites_list IS NOT NULL)', 'hasWebsitesInv')
      .addSelect('(m.databases_list IS NOT NULL)', 'hasDatabasesInv')
      .orderBy('s.createdAt', 'DESC')
      .getRawMany<ServersSummaryRow>();

    const servers = rows.map((row) => this.toLiveSummary(row));

    return {
      servers,
      total: servers.length,
      online: servers.filter((s) => s.agentConnected).length,
      generatedAt: new Date(),
    };
  }

  /** `Number(null)` es 0, que es justo el bug que se está arreglando. */
  private static numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
  }

  private toLiveSummary(row: ServersSummaryRow): ServerLiveSummaryDto {
    const hasMetrics = row.lastMetricAt !== null && row.lastMetricAt !== undefined;
    const num = AgentDataService.numberOrNull;

    return {
      serverId: row.serverId,
      name: row.name,
      status: row.status,
      agentConnected: this.agentGateway.isAgentConnected(row.serverId),
      lastSeen: row.lastSeen ?? null,
      hasMetrics,
      lastMetricAt: row.lastMetricAt ?? null,
      cpu: num(row.cpu),
      memory: num(row.memory),
      disk: hasMetrics ? AgentDataService.rootDiskUsage(row.diskFilesystems) : null,
      uptime: num(row.uptime),
      services: row.hasServicesInv ? num(row.servicesActive) : null,
      servicesTotal: row.hasServicesInv ? num(row.servicesCount) : null,
      servicesFailed: row.hasServicesInv ? num(row.servicesFailed) : null,
      websites: row.hasWebsitesInv ? num(row.websites) : null,
      databases: row.hasDatabasesInv ? num(row.databases) : null,
      processes: hasMetrics ? num(row.processes) : null,
      agentVersion: row.agentVersion ?? null,
    };
  }

  /**
   * Obtiene información del sistema de un servidor
   *
   * @param serverId - ID del servidor
   * @returns Información del sistema
   */
  async getSystemInfo(serverId: string): Promise<SystemInfoResponseDto | null> {
    const latestMetrics = await this.getLatestMetrics(serverId, SYSTEM_INFO_PROJECTION);

    if (!latestMetrics) {
      return null;
    }

    return {
      hostname: latestMetrics.system_hostname || '',
      platform: latestMetrics.system_platform || '',
      distro: latestMetrics.system_distro || '',
      kernel: latestMetrics.system_kernel || '',
      arch: latestMetrics.system_arch || '',
      uptime: Number(latestMetrics.system_uptime) || 0,
      bootTime: latestMetrics.system_boot_time || new Date(),
      publicIP: latestMetrics.network_public_ip || '',
      privateIPs: (latestMetrics.network_private_ips as string[]) || [],
    };
  }

  /**
   * Obtiene el estado de conexión del agente
   *
   * @param serverId - ID del servidor
   * @returns Estado de conexión
   */
  async getAgentConnectionStatus(
    serverId: string,
  ): Promise<AgentConnectionStatusDto> {
    const server = await this.serversRepository.findOne({
      where: { id: serverId },
    });

    if (!server) {
      throw new NotFoundException('Servidor no encontrado');
    }

    const connected = this.agentGateway.isAgentConnected(serverId);
    const latestMetrics = await this.getLatestMetrics(serverId, AGENT_STATUS_PROJECTION);

    return {
      connected,
      lastSeen: server.lastSeen || null,
      agentVersion: latestMetrics?.agent_version || null,
    };
  }

  /**
   * Obtiene métricas de las últimas N horas
   *
   * @param serverId - ID del servidor
   * @param hours - Número de horas hacia atrás (default: 24)
   * @returns Métricas históricas
   */
  async getMetricsLastHours(
    serverId: string,
    hours: number = 24,
  ): Promise<HistoricalMetricsDto> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    return this.getHistoricalMetrics(serverId, startTime, endTime);
  }

  /**
   * Actualiza el estado de **un** servicio dentro del inventario guardado.
   *
   * El agente manda el inventario completo cada 5 minutos y además deduplica:
   * sin esto, un `systemctl stop` lanzado desde el panel no se vería en la
   * interfaz hasta el siguiente ciclo. Aquí se parchea la entrada concreta y
   * se recuentan activos y fallidos, para que `GET .../latest` devuelva ya el
   * estado real.
   *
   * Devuelve la lista resultante, o `null` si el servidor todavía no tiene
   * inventario (nada que parchear).
   */
  async patchServiceState(
    serverId: string,
    patch: {
      name: string;
      state: string;
      subState: string;
      pid: number | null;
      enabled: boolean;
    },
  ): Promise<ServicePayload[] | null> {
    const metrics = await this.metricsRepository.findOne({
      where: { server_id: serverId },
      select: ['server_id', 'services_list'],
    });

    const list: ServicePayload[] = Array.isArray(metrics?.services_list)
      ? (metrics.services_list as ServicePayload[])
      : [];
    if (list.length === 0) return null;

    const index = list.findIndex((service) => sameUnit(service?.name, patch.name));
    if (index === -1) return null;

    const services = [...list];
    services[index] = {
      ...services[index],
      state: patch.state,
      subState: patch.subState,
      enabled: patch.enabled,
      pid: patch.pid,
      /* La memoria la mide el agente; tras parar el servicio ya no aplica. */
      memory: patch.state === 'active' ? services[index].memory : 0,
    };

    const counted = (state: string) => services.filter((s) => s.state === state).length;

    await this.metricsRepository.upsert(
      {
        server_id: serverId,
        timestamp: new Date(),
        services_list: services,
        services_count: services.length,
        services_active: counted('active'),
        services_failed: counted('failed'),
      },
      { conflictPaths: ['server_id'] },
    );

    return services;
  }
}