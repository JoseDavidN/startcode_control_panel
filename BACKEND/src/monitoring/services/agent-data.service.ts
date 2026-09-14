// src/monitoring/services/agent-data.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import { AgentMetrics } from '../entities/agent-metrics.entity';
import { AgentMetricsHistory } from '../entities/agent-metrics-history.entity';
import { Server } from '@servers/entities/server.entity';
import { AgentGateway } from '../gateways/agent.gateway';
import {
  AccountOverviewDto,
  HistoricalMetricsDto,
  MetricPointDto,
  ServerSummaryDto,
  SystemInfoResponseDto,
  AgentConnectionStatusDto,
} from '../dto/agent-data-response.dto';
import {
  AGENT_STATUS_PROJECTION,
  DASHBOARD_PROJECTION,
  SYSTEM_INFO_PROJECTION,
} from '../dto/metrics-projections';

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
   * Elimina entradas de la serie temporal más antiguas que N días.
   * El snapshot actual (tbl_agent_metrics) no se toca — siempre tiene 1 fila por servidor.
   */
  async cleanOldMetrics(days: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.metricsHistoryRepository.delete({
      timestamp: LessThan(cutoffDate),
    });

    const deletedCount = result.affected || 0;
    this.logger.log(
      `Limpieza de historial: ${deletedCount} registros eliminados (más de ${days} días)`,
    );

    return deletedCount;
  }

  /**
   * Obtiene estadísticas de almacenamiento de métricas
   *
   * @returns Información sobre el almacenamiento
   */
  async getStorageStats(): Promise<{
    snapshotCount: number;
    historyCount: number;
    oldestHistoryEntry: Date | null;
    newestHistoryEntry: Date | null;
    serversWithHistory: number;
  }> {
    const [snapshotCount, historyCount] = await Promise.all([
      this.metricsRepository.count(),
      this.metricsHistoryRepository.count(),
    ]);

    const [oldest, newest] = await Promise.all([
      this.metricsHistoryRepository.findOne({ order: { timestamp: 'ASC' }, select: ['timestamp'] }),
      this.metricsHistoryRepository.findOne({ order: { timestamp: 'DESC' }, select: ['timestamp'] }),
    ]);

    const raw = await this.metricsHistoryRepository
      .createQueryBuilder('h')
      .select('COUNT(DISTINCT h.server_id)', 'count')
      .getRawOne();

    return {
      snapshotCount,
      historyCount,
      oldestHistoryEntry: oldest?.timestamp || null,
      newestHistoryEntry: newest?.timestamp || null,
      serversWithHistory: parseInt(raw?.count || '0'),
    };
  }
}