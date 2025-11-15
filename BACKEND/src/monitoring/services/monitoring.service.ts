import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, ServerStatus } from '../../servers/entities/server.entity';
import { User } from '../../auth/entities/user.entity';
import { SSHService } from './ssh.service';
import { MetricsService } from './metrics.service';
import { ServerMetricsDto, QuickStatsDto } from '../dto/server-metrics.dto';
import { SSHDiagnosticDto } from '../dto/ssh-diagnostic.dto';

type QuickStatsWithServerInfo = QuickStatsDto & {
  serverId: string;
  serverName: string;
  error?: string;
};

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    @InjectRepository(Server)
    private serversRepository: Repository<Server>,
    private sshService: SSHService,
    private metricsService: MetricsService,
  ) {}

  /**
   * Verificar acceso a servidor
   * @param server - El servidor a verificar
   * @returns True si se puede acceder al servidor, false en caso contrario
   */
  private async verifyServerAccess(
    serverId: string,
    userId: string,
  ): Promise<Server> {
    const server = await this.serversRepository.findOne({
      where: { id: serverId },
      select: [
        'id',
        'str_name',
        'str_host',
        'int_port',
        'str_username',
        'str_privatekey',
        'enu_status',
        'enu_os',
        'str_owner_id',
      ],
    });

    if (!server) {
      throw new NotFoundException('Servidor no encontrado');
    }

    if (server.str_owner_id !== userId) {
      throw new ForbiddenException('No tienes acceso a este servidor');
    }

    return server;
  }

  /**
   * Obtener métricas de un servidor
   * @param serverId - El ID del servidor
   * @param userId - El ID del usuario
   * @returns Las métricas del servidor
   */
  async getServerMetrics(
    serverId: string,
    user: User,
  ): Promise<ServerMetricsDto> {
    const server = await this.verifyServerAccess(serverId, user.id);

    try {
      const metrics = await this.metricsService.getFullMetrics(server);

      // Actualizar estado y metadata del servidor
      await this.updateServerStatus(server, ServerStatus.ONLINE, {
        cpu: metrics.cpu.usage,
        memory: metrics.memory.usagePercent,
        disk: metrics.disk[0]?.usagePercent || 0,
        uptime: metrics.system.uptimeSeconds,
      });

      return metrics;
    } catch (error) {
      this.logger.error(
        `Error obteniendo métricas de ${server.str_name}: ${error.message}`,
      );

      // Actualizar estado a error
      await this.updateServerStatus(server, ServerStatus.ERROR);

      throw error;
    }
  }

  /**
   * Obtener estadisticas rapidas de un servidor
   * @param serverId - El ID del servidor
   * @param userId - El ID del usuario
   * @returns Las estadisticas rapidas del servidor
   */
  async getServerQuickStats(
    serverId: string,
    user: User,
  ): Promise<QuickStatsDto> {
    const server = await this.verifyServerAccess(serverId, user.id);

    try {
      const stats = await this.metricsService.getQuickStats(server);

      // Actualizar metadata rápidamente
      if (stats.status === 'online') {
        await this.updateServerStatus(server, ServerStatus.ONLINE, {
          cpu: stats.cpuUsage,
          memory: stats.memoryUsage,
          disk: stats.diskUsage,
          activeServices: stats.activeServices,
          uptime: stats.uptime,
          uptimeSeconds: stats.uptimeSeconds,
          network: stats.network,
        });
      }

      return stats;
    } catch (error) {
      await this.updateServerStatus(server, ServerStatus.ERROR);

      return {
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        activeServices: 0,
        uptime: 'N/A',
        uptimeSeconds: 0,
        network: 'N/A',
        status: 'offline',
      };
    }
  }

  /**
   * Obtener métricas de múltiples servidores
   * @param user - El usuario a obtener las métricas
   * @returns Las métricas de los servidores
   */
  async getMultipleServersStats(user: User): Promise<any[]> {
    const servers = await this.serversRepository.find({
      where: { str_owner_id: user.id },
      select: [
        'id',
        'str_name',
        'str_host',
        'int_port',
        'str_username',
        'str_privatekey',
        'enu_status',
      ],
    });

    const results: QuickStatsWithServerInfo[] = [];

    // Procesar servidores UNO POR UNO
    for (const server of servers) {
      try {
        this.logger.debug(`Obteniendo stats de ${server.str_name}...`);
        const stats = await this.metricsService.getQuickStats(server);

        results.push({
          serverId: server.id,
          serverName: server.str_name,
          ...stats,
        });

        // Delay entre servidores
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Actualizar metadata rápidamente
        if (stats.status === 'online') {
          await this.updateServerStatus(server, ServerStatus.ONLINE, {
            cpu: stats.cpuUsage,
            memory: stats.memoryUsage,
            disk: stats.diskUsage,
            activeServices: stats.activeServices,
            uptime: stats.uptime,
            uptimeSeconds: stats.uptimeSeconds,
            network: stats.network,
          });
        }
      } catch (error) {
        this.logger.error(
          `Error en servidor ${server.str_name}: ${error.message}`,
        );
        results.push({
          serverId: server.id,
          serverName: server.str_name,
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0,
          activeServices: 0,
          uptime: 'N/A',
          uptimeSeconds: 0,
          network: 'N/A',
          status: 'error',
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Probar conexión al servidor
   */
  async testConnection(serverId: string, user: User): Promise<any> {
    const server = await this.verifyServerAccess(serverId, user.id);

    try {
      const startTime = Date.now();
      const isConnected = await this.sshService.testConnection(server);
      const responseTime = Date.now() - startTime;

      if (isConnected) {
        await this.updateServerStatus(server, ServerStatus.ONLINE);
      } else {
        await this.updateServerStatus(server, ServerStatus.OFFLINE);
      }

      return {
        serverId: server.id,
        serverName: server.str_name,
        connected: isConnected,
        responseTime: `${responseTime}ms`,
        timestamp: new Date(),
      };
    } catch (error) {
      await this.updateServerStatus(server, ServerStatus.ERROR);

      return {
        serverId: server.id,
        serverName: server.str_name,
        connected: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Obtener top procesos
   */
  async getTopProcesses(
    serverId: string,
    user: User,
    type: 'cpu' | 'memory' = 'cpu',
    limit: number = 10,
  ): Promise<any> {
    const server = await this.verifyServerAccess(serverId, user.id);

    try {
      let processes;

      if (type === 'cpu') {
        processes = await this.metricsService.getTopProcessesByCpu(
          server,
          limit,
        );
      } else {
        processes = await this.metricsService.getTopProcessesByMemory(
          server,
          limit,
        );
      }

      return {
        serverId: server.id,
        serverName: server.str_name,
        type,
        processes,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Error obteniendo procesos de ${server.str_name}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Ejecutar comando personalizado
   */
  async executeCustomCommand(
    serverId: string,
    user: User,
    command: string,
  ): Promise<any> {
    const server = await this.verifyServerAccess(serverId, user.id);

    // Lista de comandos peligrosos bloqueados
    const dangerousCommands = [
      'rm -rf',
      'mkfs',
      'dd if=',
      '> /dev/sda',
      'chmod -R 777 /',
      'shred',
      'shutdown',
      'reboot',
      'init 0',
      'init 6',
    ];

    const isDangerous = dangerousCommands.some((dangerous) =>
      command.toLowerCase().includes(dangerous.toLowerCase()),
    );

    if (isDangerous) {
      throw new ForbiddenException('Comando bloqueado por seguridad');
    }

    try {
      const result = await this.sshService.executeCommand(server, command);

      return {
        serverId: server.id,
        serverName: server.str_name,
        command,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.code,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Error ejecutando comando en ${server.str_name}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Actualizar estado y metadata del servidor
   */
  private async updateServerStatus(
    server: Server,
    status: ServerStatus,
    metadata?: any,
  ): Promise<void> {
    server.enu_status = status;
    server.lastCheckAt = new Date();

    if (metadata) {
      server.json_metadata = { ...server.json_metadata, ...metadata };
    }

    await this.serversRepository.save(server);
  }

  /**
   * Diagnóstico completo de SSH
   */
  async sshDiagnostic(serverId: string, user: User): Promise<SSHDiagnosticDto> {
    const server = await this.verifyServerAccess(serverId, user.id);

    const startTime = Date.now();

    const diagnostic: SSHDiagnosticDto = {
      serverId: server.id,
      serverName: server.str_name,
      host: server.str_host,
      port: server.int_port,
      username: server.str_username,
      connected: false,
      checks: {
        hostReachable: false,
        portOpen: false,
        sshService: false,
        authentication: false,
        privateKeyFormat: false,
      },
      suggestions: [],
      timestamp: new Date(),
    };

    try {
      // Verificar formato de clave privada
      const privateKey = server.str_privatekey || '';
      diagnostic.checks.privateKeyFormat =
        privateKey.trim().startsWith('-----BEGIN') &&
        privateKey.trim().endsWith('-----');

      if (!diagnostic.checks.privateKeyFormat) {
        diagnostic.suggestions?.push(
          'La llave privada tiene un formato inválido. Debe comenzar con -----BEGIN y terminar con -----END',
        );
      }

      // Intentar conexión
      const isConnected = await this.sshService.testConnection(server);
      diagnostic.responseTime = Date.now() - startTime;

      if (isConnected) {
        diagnostic.connected = true;
        diagnostic.checks.hostReachable = true;
        diagnostic.checks.portOpen = true;
        diagnostic.checks.sshService = true;
        diagnostic.checks.authentication = true;
      }
    } catch (error) {
      diagnostic.error = error.message;
      diagnostic.responseTime = Date.now() - startTime;

      if (error.message.includes('ECONNREFUSED')) {
        diagnostic.suggestions?.push(
          `El puerto ${server.int_port} está cerrado o el servicio SSH no está corriendo`,
        );
        diagnostic.checks.hostReachable = true;
        diagnostic.checks.portOpen = false;
      } else if (error.message.includes('ETIMEDOUT')) {
        diagnostic.checks.hostReachable = false;
        diagnostic.suggestions?.push(
          'El servidor no responde. Verifica que el host sea correcto y esté encendido',
        );
      } else if (error.message.includes('authentication')) {
        diagnostic.checks.hostReachable = true;
        diagnostic.checks.portOpen = true;
        diagnostic.checks.sshService = true;
        diagnostic.checks.authentication = false;
        diagnostic.suggestions?.push(
          'La autenticación SSH falló. Verifica que la llave privada sea correcta',
        );
      }
    }

    return diagnostic;
  }

  /**
   * Limpiar conexiones al destruir el servicio
   */
  onModuleDestroy() {
    this.sshService.disconnectAll();
    this.logger.log('Todas las conexiones SSH cerradas');
  }
}
