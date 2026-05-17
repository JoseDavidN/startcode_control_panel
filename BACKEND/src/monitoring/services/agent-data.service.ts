// src/monitoring/services/agent-data.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import { AgentMetrics } from '../entities/agent-metrics.entity';
import { AgentMetricsHistory } from '../entities/agent-metrics-history.entity';
import { Server } from '@servers/entities/server.entity';
import { AgentGateway } from '../gateways/agent.gateway';
import {
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

  async getDashboardSummary(serverId: string): Promise<ServerSummaryDto | null> {
    const m = await this.getLatestMetrics(serverId, DASHBOARD_PROJECTION);
    if (!m) return null;

    const diskFs = m.disk_filesystems as any[];
    const rootFs = Array.isArray(diskFs)
      ? (diskFs.find((f) => f.mount === '/' || f.mountPoint === '/') ?? diskFs[0])
      : null;

    return {
      serverId,
      timestamp: m.timestamp,
      cpu: Number(m.cpu_usage) || 0,
      memory: Number(m.memory_usage_percent) || 0,
      disk: Number(rootFs?.usagePercent) || 0,
      connections: m.network_connections_active || 0,
    };
  }

  /**
   * Obtiene métricas históricas de un servidor en un rango de tiempo.
   * Consulta tbl_agent_metrics_history (serie temporal append-only).
   */
  async getHistoricalMetrics(
    serverId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<HistoricalMetricsDto> {
    const rows = await this.metricsHistoryRepository.find({
      where: {
        server_id: serverId,
        timestamp: Between(startTime, endTime),
      },
      order: { timestamp: 'ASC' },
      select: ['timestamp', 'cpu_usage', 'memory_usage_percent', 'disk_usage_percent'],
    });

    const cpuPoints: MetricPointDto[] = rows.map((r) => ({
      timestamp: r.timestamp,
      value: Number(r.cpu_usage) || 0,
    }));

    const memoryPoints: MetricPointDto[] = rows.map((r) => ({
      timestamp: r.timestamp,
      value: Number(r.memory_usage_percent) || 0,
    }));

    const diskPoints: MetricPointDto[] = rows.map((r) => ({
      timestamp: r.timestamp,
      value: Number(r.disk_usage_percent) || 0,
    }));

    return {
      serverId,
      cpu: cpuPoints,
      memory: memoryPoints,
      disk: diskPoints,
      startTime,
      endTime,
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