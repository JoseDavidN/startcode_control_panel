// src/monitoring/agent-data.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  ParseUUIDPipe,
  Query,
  Body,
  HttpCode,
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
import { DockerService } from './services/docker.service';
import { KubernetesService } from './services/kubernetes.service';
import { ServiceInstallService } from './services/service-install.service';
import { CommandService } from './services/command.service';
import { Throttle } from '@nestjs/throttler';
import {
  DockerContainersDto,
  ExecCommandDto,
  InstallServiceDto,
  KillProcessDto,
  KubernetesPodsDto,
  PinnedServicesDto,
  ServiceActionDto,
  ServiceLogsDto,
} from './dto/service-action.dto';
import {
  AccountOverviewDto,
  ServersSummaryDto,
  HistoricalMetricsDto,
  ServerSummaryDto,
  SystemInfoResponseDto,
  AgentConnectionStatusDto,
} from './dto/agent-data-response.dto';

/** Lo único que estos endpoints necesitan del request que deja `JwtAuthGuard`. */
interface AuthedRequest {
  user: { id: string };
}

@ApiTags('Agent Data')
@Controller('agent-data')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AgentDataController {
  constructor(
    private readonly agentDataService: AgentDataService,
    private readonly serversService: ServersService,
    private readonly serviceControlService: ServiceControlService,
    private readonly dockerService: DockerService,
    private readonly kubernetesService: KubernetesService,
    private readonly serviceInstall: ServiceInstallService,
    private readonly commandService: CommandService,
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
  async getLatestMetrics(@Param('id', ParseUUIDPipe) serverId: string, @Request() req: AuthedRequest) {
    const serverName = await this.verifyServerAccess(serverId, req.user.id);

    const [metrics, pinned] = await Promise.all([
      this.agentDataService.getLatestMetrics(serverId),
      this.serversService.getPinnedServices(serverId, req.user.id),
    ]);

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
        manufacturer: metrics.cpu_manufacturer || '',
        brand: metrics.cpu_brand || '',
        cores: metrics.cpu_cores ?? (metrics.cpu_usage_per_core?.length || 0),
        physicalCores: metrics.cpu_physical_cores ?? 0,
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
          free: Number(metrics.swap_free) || 0,
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
        interfaces: metrics.network_interfaces || [],
      },
      system: {
        hostname: metrics.system_hostname || '',
        platform: metrics.system_platform || '',
        distro: metrics.system_distro || '',
        kernel: metrics.system_kernel || '',
        arch: metrics.system_arch || '',
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
        active: metrics.services_active ?? 0,
        failed: metrics.services_failed ?? 0,
        list: metrics.services_list || [],
        /* Viaja con el inventario para que el tab no necesite otra consulta:
           sin ellos la lista es un volcado de ~160 unidades sin jerarquía. */
        pinned,
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
    @Param('id', ParseUUIDPipe) serverId: string,
    @Request() req: AuthedRequest,
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
    @Param('id', ParseUUIDPipe) serverId: string,
    @Query('hours', new ParseIntPipe({ optional: true })) hours: number = 24,
    @Request() req: AuthedRequest,
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
    @Param('id', ParseUUIDPipe) serverId: string,
    @Request() req: AuthedRequest,
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
    @Param('id', ParseUUIDPipe) serverId: string,
    @Request() req: AuthedRequest,
  ): Promise<AgentConnectionStatusDto> {
    // Verificar acceso
    await this.verifyServerAccess(serverId, req.user.id);

    return this.agentDataService.getAgentConnectionStatus(serverId);
  }

  /**
   * Obtiene estadísticas de almacenamiento
   */
  @Get('overview')
  @ApiOperation({
    summary: 'Resumen agregado de la cuenta',
    description:
      'Totales de servicios, sitios, bases de datos y procesos de todos los servidores del usuario, con las medias de CPU y memoria y la fecha del último reporte.',
  })
  @ApiResponse({ status: 200, type: AccountOverviewDto })
  async getOverview(@Request() req: AuthedRequest): Promise<AccountOverviewDto> {
    return this.agentDataService.getAccountOverview(req.user.id);
  }

  @Get('servers-summary')
  @ApiOperation({
    summary: 'Estado en vivo de todos los servidores del usuario',
    description:
      'CPU, memoria, disco, uptime y contadores de cada servidor en una sola consulta. Un campo en null significa "todavía sin dato", no cero.',
  })
  @ApiResponse({ status: 200, type: ServersSummaryDto })
  async getServersSummary(@Request() req: AuthedRequest): Promise<ServersSummaryDto> {
    /* Sin `verifyServerAccess`: no hay `:id`, el filtro por dueño dentro de la
       consulta es la frontera de autorización, igual que en `overview`. */
    return this.agentDataService.getServersSummary(req.user.id);
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
  @ApiResponse({
    status: 403,
    description:
      'El usuario SSH necesita contraseña de sudo (código SUDO_REQUIRED): reenvía la acción con `sudoPassword`.',
  })
  @ApiResponse({ status: 404, description: 'Servidor no encontrado' })
  async executeServiceAction(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Param('serviceName') serviceName: string,
    @Body() dto: ServiceActionDto,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.serviceControlService.executeAction(
      serverId,
      req.user.id,
      serviceName,
      dto.action,
      dto.sudoPassword,
    );
  }

  /**
   * Línea de comandos: un comando suelto por SSH, auditado
   */
  @Post('servers/:id/commands')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Ejecutar un comando en el servidor',
    description:
      'Sin TTY y con un máximo de 60 s. Devuelve la salida (stdout y stderr juntos, hasta 1 MB), el código de salida y el directorio final. Cada intento queda en la auditoría.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: 'Resultado del comando' })
  @ApiResponse({ status: 400, description: 'Comando vacío, demasiado largo o peligroso sin confirmar (DANGEROUS_COMMAND)' })
  @ApiResponse({ status: 403, description: 'Con sudo, el usuario SSH necesita contraseña (SUDO_REQUIRED)' })
  async execCommand(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Body() dto: ExecCommandDto,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.commandService.exec(serverId, req.user.id, dto);
  }

  /**
   * Auditoría de la línea de comandos del servidor
   */
  @Get('servers/:id/commands')
  @ApiOperation({ summary: 'Historial auditado de comandos del servidor' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: 'Últimos comandos: quién, cuándo, dónde y cómo terminaron' })
  async commandHistory(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Query('limit') limit: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.commandService.history(serverId, Number(limit) || 50);
  }

  /**
   * Contenedores Docker en ejecución
   */
  @Post('servers/:id/docker/containers')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Listar los contenedores Docker en ejecución',
    description:
      'Lee `docker ps` y `docker stats --no-stream` por SSH. POST porque puede llevar la contraseña de sudo.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: 'Contenedores en ejecución con su consumo' })
  @ApiResponse({ status: 403, description: 'El usuario SSH no puede usar docker y sudo pide contraseña (SUDO_REQUIRED)' })
  @ApiResponse({ status: 503, description: 'Docker no está instalado o el daemon no responde (DOCKER_UNAVAILABLE)' })
  async listDockerContainers(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Body() dto: DockerContainersDto,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.dockerService.listContainers(serverId, req.user.id, dto.sudoPassword);
  }

  /**
   * Instala un servicio (nginx…) en el servidor
   */
  @Post('servers/:id/services/install')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Instalar un servicio en el servidor',
    description:
      'Por SSH: detecta el sistema y el gestor de paquetes (apt, dnf, yum, zypper, apk, pacman), instala, arranca, habilita y comprueba. El progreso llega por el socket (`service:install:progress`); el resultado con todos los pasos, en la respuesta. Una instalación a la vez por servidor.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: '`ok` y los pasos; si falla, `error` con el motivo y las últimas líneas de la salida' })
  @ApiResponse({ status: 403, description: 'Hace falta la contraseña de sudo (SUDO_REQUIRED)' })
  async installService(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Body() dto: InstallServiceDto,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.serviceInstall.install(serverId, req.user.id, dto.service, dto.sudoPassword);
  }

  /**
   * ¿Está instalado un servicio del catálogo? (decide instalar o desinstalar)
   */
  @Post('servers/:id/services/install-status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Saber si un servicio del catálogo ya está instalado', description: 'Por SSH y sin privilegios: sistema, gestor de paquetes, si está instalado y su versión.' })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  async serviceInstallStatus(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Body() dto: InstallServiceDto,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.serviceInstall.status(serverId, req.user.id, dto.service);
  }

  /**
   * Desinstala por completo un servicio del catálogo
   */
  @Post('servers/:id/services/uninstall')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Desinstalar por completo un servicio',
    description:
      'Por SSH: detiene y deshabilita el servicio, purga sus paquetes y las dependencias que quedan sin uso, borra configuración, registros, caché, unidades y el usuario de sistema propio, y comprueba que no quede rastro. Progreso por el socket (`service:install:progress`).',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: '`ok` y los pasos; si queda algún resto, `error` RESIDUE_LEFT con la lista' })
  @ApiResponse({ status: 403, description: 'Hace falta la contraseña de sudo (SUDO_REQUIRED)' })
  async uninstallService(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Body() dto: InstallServiceDto,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.serviceInstall.uninstall(serverId, req.user.id, dto.service, dto.sudoPassword);
  }

  /**
   * Pods de Kubernetes del servidor
   */
  @Post('servers/:id/kubernetes/pods')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Listar los pods de Kubernetes',
    description:
      'Lee `kubectl get pods -A -o json` y, si hay metrics-server, `kubectl top pods` por SSH, con el CLI que haya (kubectl, k3s, microk8s o rke2). Solo lectura. POST porque puede llevar la contraseña de sudo.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: 'Pods de todos los namespaces con estado y consumo' })
  @ApiResponse({ status: 403, description: 'El kubeconfig solo lo lee root y sudo pide contraseña (SUDO_REQUIRED)' })
  @ApiResponse({ status: 503, description: 'Sin kubectl o el clúster no responde (KUBERNETES_UNAVAILABLE)' })
  async listKubernetesPods(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Body() dto: KubernetesPodsDto,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.kubernetesService.listPods(serverId, req.user.id, dto.sudoPassword);
  }

  /**
   * Cierra un proceso con SIGTERM (no forzado)
   */
  @Post('servers/:id/processes/:pid/kill')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cerrar un proceso del servidor',
    description: 'Envía SIGTERM (`kill -TERM`, sin `-9`) para que el proceso termine limpio.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiParam({ name: 'pid', description: 'PID del proceso' })
  @ApiResponse({ status: 200, description: 'Resultado; `exited` indica si ya terminó' })
  @ApiResponse({ status: 400, description: 'PID inválido o proceso protegido (PROTECTED_PROCESS)' })
  @ApiResponse({ status: 403, description: 'El proceso es de otro usuario y sudo pide contraseña (SUDO_REQUIRED)' })
  @ApiResponse({ status: 404, description: 'El proceso ya no existe (PROCESS_NOT_FOUND)' })
  async killProcess(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Param('pid', ParseIntPipe) pid: number,
    @Body() dto: KillProcessDto,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.serviceControlService.killProcess(serverId, req.user.id, pid, dto.sudoPassword);
  }

  /**
   * Últimas líneas del journal de una unidad
   */
  @Post('servers/:id/services/:serviceName/logs')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Leer el journal de un servicio',
    description:
      'Devuelve las últimas líneas de `journalctl -u <unidad>`, que es lo que explica por qué una unidad está en `failed`.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiParam({ name: 'serviceName', description: 'Nombre del servicio systemd' })
  @ApiResponse({ status: 200, description: 'Líneas del journal' })
  @ApiResponse({ status: 403, description: 'El journal exige privilegios (SUDO_REQUIRED)' })
  async getServiceLogs(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Param('serviceName') serviceName: string,
    @Body() dto: ServiceLogsDto,
    @Request() req: AuthedRequest,
  ) {
    await this.verifyServerAccess(serverId, req.user.id);
    return this.serviceControlService.readLogs(serverId, req.user.id, serviceName, {
      lines: dto.lines,
      sudoPassword: dto.sudoPassword,
    });
  }

  /**
   * Servicios fijados del servidor
   */
  @Put('servers/:id/services/pinned')
  @ApiOperation({
    summary: 'Fijar los servicios que importan en este servidor',
    description:
      'Reemplaza la lista entera. Son los que el tab de servicios enseña primero, por encima del inventario completo.',
  })
  @ApiParam({ name: 'id', description: 'ID del servidor' })
  @ApiResponse({ status: 200, description: 'Lista de servicios fijados ya guardada' })
  async setPinnedServices(
    @Param('id', ParseUUIDPipe) serverId: string,
    @Body() dto: PinnedServicesDto,
    @Request() req: AuthedRequest,
  ): Promise<{ pinned: string[] }> {
    const pinned = await this.serversService.setPinnedServices(
      serverId,
      req.user.id,
      dto.services,
    );

    return { pinned };
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
