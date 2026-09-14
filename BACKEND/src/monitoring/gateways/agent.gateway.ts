// src/monitoring/gateways/agent.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, UseFilters } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server as ServerEntity, ServerStatus } from '@servers/entities/server.entity';
import { AgentMetrics } from '../entities/agent-metrics.entity';
import { AgentMetricsHistory } from '../entities/agent-metrics-history.entity';
import {
  AgentMessageDto,
  AgentMessageType,
  MetricsDataDto,
} from '../dto/agent-message.dto';
import { NotificationsService } from '@/notifications/notifications.service';

/**
 * WebSocket Gateway para comunicación con agentes de monitoreo
 *
 * Este gateway:
 * - Acepta conexiones WebSocket de agentes
 * - Autentica mediante token
 * - Recibe y procesa métricas
 * - Almacena en base de datos
 * - Emite eventos en tiempo real al frontend
 */
@WebSocketGateway({ namespace: '/agent' })
export class AgentGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);

  // Mapa de conexiones activas: serverId -> socket
  private connections = new Map<string, Socket>();

  constructor(
    @InjectRepository(ServerEntity)
    private serversRepository: Repository<ServerEntity>,
    @InjectRepository(AgentMetrics)
    private metricsRepository: Repository<AgentMetrics>,
    @InjectRepository(AgentMetricsHistory)
    private metricsHistoryRepository: Repository<AgentMetricsHistory>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Lifecycle: Gateway inicializado
   */
  afterInit(server: Server) {
    this.logger.log('🚀 Agent WebSocket Gateway inicializado');

    /* El service avisa por aquí cuando crea una notificación. Sin payload: el
       namespace es broadcast global, así que el cliente solo recibe la señal y
       recarga su lista con su propio JWT. */
    this.notificationsService.setBroadcaster(() =>
      this.server.emit('notifications:changed'),
    );
    this.logger.log(
      `📡 Escuchando en: ws://localhost:${process.env.PORT || 3001}/agent`,
    );
  }

  /**
   * Lifecycle: Cliente conectado
   */
  async handleConnection(client: Socket) {
    this.logger.log(`🔌 Nuevo cliente conectando: ${client.id}`);

    // El cliente debe enviar un mensaje de autenticación
    // Por ahora solo logueamos, la autenticación se hace en el primer mensaje
  }

  /**
   * Lifecycle: Cliente desconectado
   */
  async handleDisconnect(client: Socket) {
    // Buscar y eliminar de conexiones activas
    for (const [serverId, socket] of this.connections.entries()) {
      if (socket.id === client.id) {
        this.logger.log(`❌ Agente desconectado: ${serverId}`);
        this.connections.delete(serverId);

        // Actualizar estado del servidor a OFFLINE
        await this.serversRepository.update(serverId, {
          status: ServerStatus.OFFLINE,
        });
        this.logger.log(`🔴 Estado actualizado a OFFLINE: ${serverId}`);

        // Emitir evento al frontend
        this.server.emit('agent:disconnected', { serverId });

        const offline = await this.serversRepository.findOne({
          where: { id: serverId },
        });
        if (offline) {
          await this.notificationsService
            .serverWentOffline(offline)
            .catch((err) =>
              this.logger.error(`Error notificando desconexión: ${err.message}`),
            );
        }
        break;
      }
    }
  }

  /**
   * Handler: Mensaje recibido del agente
   *
   * Este es el handler principal que procesa TODOS los mensajes
   */
  @SubscribeMessage('agent:message')
  async handleMessage(client: Socket, payload: any) {
    try {
      // Validar estructura básica del mensaje
      if (!payload || !payload.token || !payload.serverId || !payload.type) {
        this.logger.warn(`⚠️  Mensaje inválido recibido de ${client.id}: ${JSON.stringify(payload)}`);
        client.emit('error', { message: 'Mensaje inválido' });
        return;
      }

      const message = payload as AgentMessageDto;
      this.logger.debug(`📨 Mensaje recibido - Tipo: ${message.type}, Servidor: ${message.serverId}`);

      // Autenticar el mensaje
      const server = await this.authenticateMessage(message);
      if (!server) {
        this.logger.warn(
          `🔐 Autenticación fallida para servidor: ${message.serverId}`,
        );
        client.emit('error', { message: 'Autenticación fallida' });
        client.disconnect();
        return;
      }

      // Registrar conexión activa
      if (!this.connections.has(server.id)) {
        this.connections.set(server.id, client);
        this.logger.log(
          `✅ Agente autenticado: ${server.name} (${server.id})`,
        );

        // Actualizar estado del servidor a ONLINE
        await this.serversRepository.update(server.id, {
          status: ServerStatus.ONLINE,
          lastSeen: new Date(),
        });
        this.logger.log(`🟢 Estado actualizado a ONLINE: ${server.name}`);

        // Emitir evento al frontend
        this.server.emit('agent:connected', {
          serverId: server.id,
          serverName: server.name,
        });

        if (server.status === ServerStatus.OFFLINE) {
          await this.notificationsService
            .serverCameBack(server)
            .catch((err) =>
              this.logger.error(`Error notificando reconexión: ${err.message}`),
            );
        }
      }

      // Procesar según tipo de mensaje
      await this.processMessage(message, server);

      // Confirmar recepción al agente
      client.emit('ack', { messageId: message.messageId });
    } catch (error) {
      this.logger.error(
        `❌ Error procesando mensaje: ${error.message}`,
        error.stack,
      );
      client.emit('error', { message: 'Error procesando mensaje' });
    }
  }

  /**
   * Autentica un mensaje verificando el token
   *
   * @param message - Mensaje del agente
   * @returns Servidor si la autenticación es exitosa, null en caso contrario
   */
  private async authenticateMessage(
    message: AgentMessageDto,
  ): Promise<ServerEntity | null> {
    try {
      const payload = this.jwtService.verify(message.token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (payload.type !== 'agent') {
        this.logger.warn(`Token de tipo incorrecto para ${message.serverId}: tipo="${payload.type}"`);
        return null;
      }

      if (payload.sub !== message.serverId) {
        this.logger.warn(`Token no corresponde al serverId declarado: token.sub="${payload.sub}" mensaje.serverId="${message.serverId}"`);
        return null;
      }

      const server = await this.serversRepository.findOne({
        where: { id: message.serverId },
      });

      if (!server) {
        this.logger.warn(`Servidor no encontrado: ${message.serverId}`);
        return null;
      }

      return server;
    } catch (error) {
      this.logger.warn(`Token de agente inválido o expirado para ${message.serverId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Procesa el mensaje según su tipo
   *
   * @param message - Mensaje del agente
   * @param server - Servidor autenticado
   */
  private async processMessage(
    message: AgentMessageDto,
    server: ServerEntity,
  ): Promise<void> {
    this.logger.debug(`🔀 Procesando mensaje tipo: ${message.type} de servidor: ${server.name}`);

    switch (message.type) {
      case AgentMessageType.HEARTBEAT:
        await this.handleHeartbeat(message, server);
        break;

      case AgentMessageType.SYSTEM_INFO:
        await this.handleSystemInfo(message, server);
        break;

      case AgentMessageType.METRICS:
        await this.handleMetrics(message, server);
        break;

      case AgentMessageType.SERVICES_INVENTORY:
        await this.handleServicesInventory(message, server);
        break;

      case AgentMessageType.PROCESSES_INVENTORY:
        await this.handleProcessesInventory(message, server);
        break;

      case AgentMessageType.WEBSITES_INVENTORY:
        await this.handleWebsitesInventory(message, server);
        break;

      case AgentMessageType.DATABASES_INVENTORY:
        await this.handleDatabasesInventory(message, server);
        break;

      default:
        this.logger.warn(`Tipo de mensaje desconocido: ${message.type}`);
    }
  }

  /**
   * Handler: Heartbeat
   */
  private async handleHeartbeat(
    message: AgentMessageDto,
    server: ServerEntity,
  ): Promise<void> {
    this.logger.debug(`💓 Heartbeat recibido: ${server.name}`);

    // Actualizar última vez visto
    await this.serversRepository.update(server.id, {
      lastSeen: new Date(),
    });
  }

  /**
   * Handler: System Info
   */
  private async handleSystemInfo(
    message: AgentMessageDto,
    server: ServerEntity,
  ): Promise<void> {
    this.logger.log(`ℹ️  System info recibido: ${server.name}`);

    const systemInfo = message.data;

    // Actualizar información del servidor en la BD
    await this.serversRepository.update(server.id, {
      hostname: systemInfo.hostname,
      osVersion: systemInfo.distro,
      kernelVersion: systemInfo.kernel,
      lastSeen: new Date(),
    });

    // Emitir evento al frontend
    this.server.emit('server:info:updated', {
      serverId: server.id,
      systemInfo,
    });
  }

  /**
   * Handler: Métricas en tiempo real
   */
  private async handleMetrics(
    message: AgentMessageDto,
    server: ServerEntity,
  ): Promise<void> {
    const metricsData = message.data as MetricsDataDto;

    this.logger.debug(
      `📊 Métricas recibidas: ${server.name} - CPU: ${metricsData.cpu.usage}%`,
    );

    // Obtener registro existente o crear uno nuevo
    let metrics = await this.metricsRepository.findOne({
      where: { server_id: server.id },
    });

    if (!metrics) {
      metrics = this.metricsRepository.create({ server_id: server.id });
    }

    // Actualizar todos los campos
    metrics.timestamp = new Date();

    // CPU
    metrics.cpu_usage = metricsData.cpu.usage;
    metrics.cpu_usage_per_core = metricsData.cpu.usagePerCore;
    metrics.cpu_load_average_1m = metricsData.cpu.loadAverage.current;
    metrics.cpu_load_average_5m = metricsData.cpu.loadAverage.avg5;
    metrics.cpu_load_average_15m = metricsData.cpu.loadAverage.avg15;

    // Memoria
    metrics.memory_total = metricsData.memory.total;
    metrics.memory_used = metricsData.memory.used;
    metrics.memory_free = metricsData.memory.free;
    metrics.memory_available = metricsData.memory.available;
    metrics.memory_usage_percent = metricsData.memory.usagePercent;
    metrics.swap_total = metricsData.memory.swapTotal;
    metrics.swap_used = metricsData.memory.swapUsed;
    metrics.swap_usage_percent = metricsData.memory.swapUsagePercent;

    // Disco
    metrics.disk_filesystems = metricsData.disk.filesystems;

    // Red
    if (metricsData.network.publicIP) {
      metrics.network_public_ip = metricsData.network.publicIP;
    }
    metrics.network_private_ips = metricsData.network.privateIPs;
    metrics.network_connections_active = metricsData.network.connections.active;
    metrics.network_connections_listening = metricsData.network.connections.listening;

    // Sistema
    metrics.system_hostname = metricsData.system.hostname;
    metrics.system_platform = metricsData.system.platform;
    metrics.system_distro = metricsData.system.distro;
    metrics.system_kernel = metricsData.system.kernel;
    metrics.system_uptime = metricsData.system.uptime;
    metrics.system_boot_time = new Date(metricsData.system.bootTime);

    // Procesos top (viene en cpu.topProcesses)
    metrics.processes_top_list = metricsData.cpu.topProcesses || [];

    // Metadata
    metrics.agent_version = message.agentVersion;
    metrics.message_id = message.messageId;
    metrics.message_type = message.type;

    // Guardar snapshot actual (tbl_agent_metrics, 1 fila por servidor)
    await this.metricsRepository.save(metrics);

    // Insertar punto en la serie temporal (fire-and-forget, no bloquea la respuesta)
    const rootFs = (metricsData.disk.filesystems as any[])?.find(
      (fs: any) => fs.mount === '/' || fs.mountPoint === '/',
    );
    this.metricsHistoryRepository
      .insert({
        server_id: server.id,
        cpu_usage: metricsData.cpu.usage,
        cpu_load_average_1m: metricsData.cpu.loadAverage.current,
        memory_usage_percent: metricsData.memory.usagePercent,
        swap_usage_percent: metricsData.memory.swapUsagePercent,
        disk_usage_percent: rootFs?.usagePercent ?? null,
        network_connections_active: metricsData.network.connections.active,
        system_uptime: metricsData.system.uptime,
      })
      .catch((err) =>
        this.logger.error(`Error guardando historial de métricas: ${err.message}`),
      );

    // Actualizar última vez visto
    await this.serversRepository.update(server.id, {
      lastSeen: new Date(),
    });

    const live = {
      cpu: metricsData.cpu.usage,
      memory: metricsData.memory.usagePercent,
      disk: metricsData.disk.filesystems[0]?.usagePercent || 0,
    };

    // Emitir evento en tiempo real al frontend
    this.server.emit('server:metrics:realtime', {
      serverId: server.id,
      serverName: server.name,
      metrics: { ...live, uptime: metricsData.system.uptime },
      timestamp: new Date(),
    });

    // Umbrales del dueño del servidor: crea notificación solo en el cruce
    await this.notificationsService
      .evaluateMetrics(server, live)
      .catch((err) =>
        this.logger.error(`Error evaluando umbrales: ${err.message}`),
      );
  }

  /**
   * Handler: Inventario de servicios
   */
  private async handleServicesInventory(
    message: AgentMessageDto,
    server: ServerEntity,
  ): Promise<void> {
    this.logger.log(`🔧 Inventario de servicios recibido: ${server.name}`);

    // El agente envía { services: [...] }, no un array directo
    const services = Array.isArray(message.data)
      ? message.data
      : (message.data?.services || []);

    this.logger.debug(`📊 Guardando ${services.length} servicios en BD`);

    // Usar UPDATE directo para asegurar que los cambios se persistan
    await this.metricsRepository
      .createQueryBuilder()
      .update()
      .set({
        timestamp: new Date(),
        services_count: services.length,
        services_list: services,
      })
      .where('server_id = :serverId', { serverId: server.id })
      .execute();

    // Actualizar también el campo metadata.activeServices en la entidad Server
    const metadata = server.metadata || {};
    metadata.activeServices = services.length;
    await this.serversRepository.update(server.id, {
      metadata: metadata,
      lastSeen: new Date(),
    });

    this.logger.debug(`✅ Servicios guardados correctamente (${services.length} servicios)`);

    // Emitir al frontend
    this.server.emit('server:services:updated', {
      serverId: server.id,
      services: services,
    });
  }

  /**
   * Handler: Inventario de procesos
   */
  private async handleProcessesInventory(
    message: AgentMessageDto,
    server: ServerEntity,
  ): Promise<void> {
    this.logger.log(`⚙️  Inventario de procesos recibido: ${server.name}`);

    const processesData = message.data || {};

    // Usar UPDATE directo
    await this.metricsRepository
      .createQueryBuilder()
      .update()
      .set({
        timestamp: new Date(),
        processes_total: processesData.total || 0,
        processes_running: processesData.running || 0,
        processes_sleeping: processesData.sleeping || 0,
        processes_stopped: processesData.stopped || 0,
        processes_zombie: processesData.zombie || 0,
      })
      .where('server_id = :serverId', { serverId: server.id })
      .execute();

    // Emitir al frontend
    this.server.emit('server:processes:updated', {
      serverId: server.id,
      processes: processesData,
    });
  }

  /**
   * Handler: Inventario de sitios web
   */
  private async handleWebsitesInventory(
    message: AgentMessageDto,
    server: ServerEntity,
  ): Promise<void> {
    this.logger.log(`🌐 Inventario de sitios web recibido: ${server.name}`);

    const websites = Array.isArray(message.data) ? message.data : [];

    // Usar UPDATE directo
    await this.metricsRepository
      .createQueryBuilder()
      .update()
      .set({
        timestamp: new Date(),
        websites_count: websites.length,
        websites_list: websites,
      })
      .where('server_id = :serverId', { serverId: server.id })
      .execute();

    // Emitir al frontend
    this.server.emit('server:websites:updated', {
      serverId: server.id,
      websites: websites,
    });
  }

  /**
   * Handler: Inventario de bases de datos
   */
  private async handleDatabasesInventory(
    message: AgentMessageDto,
    server: ServerEntity,
  ): Promise<void> {
    this.logger.log(
      `💾 Inventario de bases de datos recibido: ${server.name}`,
    );

    const databases = Array.isArray(message.data) ? message.data : [];

    // Usar UPDATE directo
    await this.metricsRepository
      .createQueryBuilder()
      .update()
      .set({
        timestamp: new Date(),
        databases_count: databases.length,
        databases_list: databases,
      })
      .where('server_id = :serverId', { serverId: server.id })
      .execute();

    // Emitir al frontend
    this.server.emit('server:databases:updated', {
      serverId: server.id,
      databases: databases,
    });
  }

  /**
   * Obtiene el estado de conexión de un servidor
   *
   * @param serverId - ID del servidor
   * @returns true si el agente está conectado
   */
  public isAgentConnected(serverId: string): boolean {
    return this.connections.has(serverId);
  }

  /**
   * Obtiene estadísticas del gateway
   */
  public getStats() {
    return {
      totalConnections: this.connections.size,
      connectedServers: Array.from(this.connections.keys()),
    };
  }
}
