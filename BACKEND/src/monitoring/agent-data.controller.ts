// src/monitoring/agent-data.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/jwt-auth/jwt-auth.guard';
import { AgentDataService } from './services/agent-data.service';
import { ServersService } from '@servers/servers.service';
import { ServiceControlService } from './services/service-control.service';
import { ServiceActionDto } from './dto/service-action.dto';
import {
  HistoricalMetricsDto,
  ServerSummaryDto,
  SystemInfoResponseDto,
  AgentConnectionStatusDto,
} from './dto/agent-data-response.dto';

@ApiTags('Agent Data')
@Controller('agent-data')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AgentDataController {
  constructor(
    private readonly agentDataService: AgentDataService,
    private readonly serversService: ServersService,
    private readonly serviceControlService: ServiceControlService,
  ) {}

  /**
   * Obtiene las métricas más recientes de un servidor
   */
  @Get('servers/:id/latest')
  @ApiOperation({ summary: 'Obtener métricas más recientes de un servidor' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({
    status: 200,
    description: 'Métricas más recientes',
  })
  @ApiResponse({ status: 404, description: 'Servidor no encontrado' })
  async getLatestMetrics(@Param('id') serverId: string, @Request() req) {
    const serverName = await this.verifyServerAccess(serverId, req.user.id);

    const metrics = await this.agentDataService.getLatestMetrics(serverId);

    if (!metrics) {
      throw new NotFoundException(
        'No hay métricas disponibles para este servidor',
      );
    }

    return {
      serverId,
      serverName,
      timestamp: metrics.timestamp,
      cpu: {
        usage: Number(metrics.cpu_usage) || 0,
        usagePerCore: metrics.cpu_usage_per_core || [],
        loadAverage: {
          current: Number(metrics.cpu_load_average_1m) || 0,
          avg5: Number(metrics.cpu_load_average_5m) || 0,
          avg15: Number(metrics.cpu_load_average_15m) || 0,
        },
      },
      memory: {
        total: Number(metrics.memory_total) || 0,
        used: Number(metrics.memory_used) || 0,
        free: Number(metrics.memory_free) || 0,
        available: Number(metrics.memory_available) || 0,
        usagePercent: Number(metrics.memory_usage_percent) || 0,
        swap: {
          total: Number(metrics.swap_total) || 0,
          used: Number(metrics.swap_used) || 0,
          usagePercent: Number(metrics.swap_usage_percent) || 0,
        },
      },
      disk: {
        filesystems: metrics.disk_filesystems || [],
      },
      network: {
        publicIP: metrics.network_public_ip || null,
        privateIPs: metrics.network_private_ips || [],
        connections: {
          active: metrics.network_connections_active || 0,
          listening: metrics.network_connections_listening || 0,
        },
      },
      system: {
        hostname: metrics.system_hostname || '',
        platform: metrics.system_platform || '',
        distro: metrics.system_distro || '',
        kernel: metrics.system_kernel || '',
        uptime: Number(metrics.system_uptime) || 0,
        bootTime: metrics.system_boot_time || new Date(),
      },
      processes: {
        total: metrics.processes_total || 0,
        running: metrics.processes_running || 0,
        sleeping: metrics.processes_sleeping || 0,
        stopped: metrics.processes_stopped || 0,
        zombie: metrics.processes_zombie || 0,
        topList: metrics.processes_top_list || [],
      },
      services: {
        count: metrics.services_count || 0,
        list: metrics.services_list || [],
      },
      websites: {
        count: metrics.websites_count || 0,
        list: metrics.websites_list || [],
      },
      databases: {
        count: metrics.databases_count || 0,
        list: metrics.databases_list || [],
      },
    };
  }

  /**
   * Resumen de métricas para el dashboard (proyección mínima)
   */
  @Get('servers/:id/summary')
  @ApiOperation({ summary: 'Resumen de métricas para el dashboard' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: 'Resumen de métricas', type: ServerSummaryDto })
  @ApiResponse({ status: 404, description: 'Servidor no encontrado o sin métricas' })
  async getServerSummary(
    @Param('id') serverId: string,
    @Request() req,
  ): Promise<ServerSummaryDto> {
    await this.verifyServerAccess(serverId, req.user.id);

    const summary = await this.agentDataService.getDashboardSummary(serverId);

    if (!summary) {
      throw new NotFoundException('No hay métricas disponibles para este servidor');
    }

    return summary;
  }

  /**
   * Obtiene métricas históricas de las últimas N horas
   */
  @Get('servers/:id/historical')
  @ApiOperation({ summary: 'Obtener métricas históricas' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiQuery({
    name: 'hours',
    required: false,
    description: 'Número de horas hacia atrás (default: 24)',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas históricas',
    type: HistoricalMetricsDto,
  })
  async getHistoricalMetrics(
    @Param('id') serverId: string,
    @Query('hours', new ParseIntPipe({ optional: true })) hours: number = 24,
    @Request() req,
  ): Promise<HistoricalMetricsDto> {
    // Verificar acceso
    await this.verifyServerAccess(serverId, req.user.id);

    return this.agentDataService.getMetricsLastHours(serverId, hours);
  }

  /**
   * Obtiene información del sistema
   */
  @Get('servers/:id/system-info')
  @ApiOperation({ summary: 'Obtener información del sistema' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({
    status: 200,
    description: 'Información del sistema',
    type: SystemInfoResponseDto,
  })
  async getSystemInfo(
    @Param('id') serverId: string,
    @Request() req,
  ): Promise<SystemInfoResponseDto> {
    // Verificar acceso
    await this.verifyServerAccess(serverId, req.user.id);

    const systemInfo = await this.agentDataService.getSystemInfo(serverId);

    if (!systemInfo) {
      throw new NotFoundException('No hay información del sistema disponible');
    }

    return systemInfo;
  }

  /**
   * Obtiene el estado de conexión del agente
   */
  @Get('servers/:id/agent-status')
  @ApiOperation({ summary: 'Obtener estado de conexión del agente' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({
    status: 200,
    description: 'Estado de conexión',
    type: AgentConnectionStatusDto,
  })
  async getAgentStatus(
    @Param('id') serverId: string,
    @Request() req,
  ): Promise<AgentConnectionStatusDto> {
    // Verificar acceso
    await this.verifyServerAccess(serverId, req.user.id);

    return this.agentDataService.getAgentConnectionStatus(serverId);
  }

  /**
   * Obtiene estadísticas de almacenamiento
   */
  @Get('storage-stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de almacenamiento de métricas',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas de almacenamiento',
  })
  async getStorageStats() {
    return this.agentDataService.getStorageStats();
  }

  /**
   * Ejecuta una acción (start/stop/restart) sobre un servicio del servidor vía SSH
   */
  @Post('servers/:id/services/:serviceName/action')
  @ApiOperation({ summary: 'Ejecutar acción sobre un servicio del servidor' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiParam({ name: 'serviceName', description: 'Nombre del servicio systemd' })
  @ApiResponse({ status: 200, description: 'Resultado de la acción' })
  @ApiResponse({ status: 400, description: 'Nombre de servicio o acción inválidos' })
  @ApiResponse({ status: 404, description: 'Servidor no encontrado' })
  async executeServiceAction(
    @Param('id') serverId: string,
    @Param('serviceName') serviceName: string,
    @Body() dto: ServiceActionDto,
    @Request() req,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.serviceControlService.executeAction(serverId, req.user.id, serviceName, dto.action);
  }

  /**
   * Verifica que el usuario tenga acceso al servidor
   */
  private async verifyServerAccess(
    serverId: string,
    userId: string,
  ): Promise<string> {
    return this.serversService.findNameAndVerifyOwnership(serverId, userId);
  }
}
