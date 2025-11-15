import { Injectable, Logger } from '@nestjs/common';
import { SSHService } from './ssh.service';
import { Server } from '../../servers/entities/server.entity';
import { 
  ServerMetricsDto,
  CpuMetricsDto,
  MemoryMetricsDto,
  DiskMetricsDto,
  NetworkMetricsDto,
  SystemInfoDto,
  ProcessInfoDto,
  QuickStatsDto,
} from '../dto/server-metrics.dto';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(private sshService: SSHService) {}

  /**
   * Obtener todas las métricas de un servidor
   * @param server - El servidor a obtener las métricas
   * @returns Las métricas del servidor
   */
  async getFullMetrics(server: Server): Promise<ServerMetricsDto> {
    try {
      // Desconectar conexion previa para evitar saturacion de conexiones
      await this.sshService.disconnect(server.id);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const [cpu, memory, disk, network, system, processes] = await Promise.all([
        this.getCpuMetrics(server),
        this.getMemoryMetrics(server),
        this.getDiskMetrics(server),
        this.getNetworkMetrics(server),
        this.getSystemInfo(server),
        this.getProcessInfo(server),
      ]);

      // Limpiar conexion al terminar
      await this.sshService.disconnect(server.id);

      return {
        serverId: server.id,
        serverName: server.str_name,
        cpu,
        memory,
        disk,
        network,
        system,
        processes,
        timestamp: new Date(),
        status: 'online',
      };
    } catch (error) {
      // Limpiar conexion en caso de error
      await this.sshService.disconnect(server.id);
      this.logger.error(
        `Error obteniendo métricas de ${server.str_name}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Obtener metricas rapidas
   * @param server - El servidor a obtener las métricas
   * @returns Las métricas rápidas del servidor
   */
  async getQuickStats(server: Server): Promise<QuickStatsDto> {
    try {
      const [cpu, memory, disk, activeServices, uptime, network] = await Promise.all([
        this.getCpuMetrics(server),
        this.getMemoryMetrics(server),
        this.getDiskMetrics(server),
        this.getActiveServicesCount(server),
        this.getUptimeInfo(server),
        this.getNetworkMetrics(server),
      ]);

      return {
        cpuUsage: cpu.usage,
        memoryUsage: memory.usagePercent,
        diskUsage: disk[0]?.usagePercent || 0,
        activeServices: activeServices,
        uptime: uptime.formatted,
        uptimeSeconds: uptime.seconds,
        network: network.publicIp,
        status: 'online',
      };
    } catch (error) {
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
   * Métricas de CPU
   * @param server - El servidor a obtener las métricas
   * @returns Las métricas de CPU del servidor
   */
  async getCpuMetrics(server: Server): Promise<CpuMetricsDto> {
    const command = [
      "top -bn1 | grep 'Cpu(s)' | awk '{print 100 - $8}'",
      // "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'",
      'nproc',
      "uptime | awk -F'load average:' '{print $2}' | xargs",
    ];

    const results = await this.sshService.executeCommands(server, command);

    const usage = parseFloat(results[0].stdout.trim()) || 0;
    const cores = parseInt(results[1].stdout.trim()) || 1;
    const loadAverage = results[2].stdout.trim() || '0, 0, 0';

    return {
      usage: Math.round(usage * 100) / 100,
      cores,
      loadAverage,
    }
  }

  /**
   * Métricas de memoria
   * @param server - El servidor a obtener las métricas
   * @returns Las métricas de memoria del servidor
   */
  async getMemoryMetrics(server: Server): Promise<MemoryMetricsDto> {
    const command = "free -m | grep Mem | awk '{print $2, $3, $4}'"
    const result = await this.sshService.executeCommand(server, command);

    const [total, used, free] = result.stdout.trim().split(' ').map((v) => parseInt(v))

    const usagePercent = Math.round((used / total) * 100);

    return {
      total,
      used,
      free,
      usagePercent: Math.round(usagePercent * 100) / 100,
    };
  }

  /**
   * Métricas de disco
   * @param server - El servidor a obtener las métricas
   * @returns Las métricas de disco del servidor
   */
  async getDiskMetrics(server: Server): Promise<DiskMetricsDto[]> {
    const command = "df -BG | grep '^/' | awk '{print $2, $3, $4, $5, $6}'"
    const result = await this.sshService.executeCommand(server, command);

    const disks: DiskMetricsDto[] = [];
    const lines = result.stdout.trim().split('\n');

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 5) {
        const total = parseInt(parts[0].replace('G', ''));
        const used = parseInt(parts[1].replace('G', ''));
        const free = parseInt(parts[2].replace('G', ''));
        const usagePercent = parseInt(parts[3].replace('%', ''));
        const mountPoint = parts[4];

        disks.push({
          total,
          used,
          free,
          usagePercent,
          mountPoint,
        });
      }
    }

    return disks;
  }

  /**
   * Métricas de red
   * @param server - El servidor a obtener las métricas
   * @returns Las métricas de red del servidor
   */
  async getNetworkMetrics(server: Server): Promise<NetworkMetricsDto> {
    const commands = [
      "hostname -I | awk '{print $1}'",
      "curl -s ifconfig.me || echo 'N/A'",
      "ip route | grep default | awk '{print $5}' | head -1",
    ]
    const results = await this.sshService.executeCommands(server, commands);

    return {
      privateIp: results[0].stdout.trim() || 'N/A',
      publicIp: results[1].stdout.trim() || 'N/A',
      interface: results[2].stdout.trim() || 'N/A',
    };
  }

  /**
   * Métricas de sistema
   * @param server - El servidor a obtener las métricas
   * @returns Las métricas de sistema del servidor
   */
  async getSystemInfo(server: Server): Promise<SystemInfoDto> {
    const commands = [
      'lsb_release -d | cut -f2 || cat /etc/os-release | grep PRETTY_NAME | cut -d\" -f2',
      'uname -r',
      'hostname',
      "uptime -p | sed 's/up //'",
      "cat /proc/uptime | awk '{print $1}'",
    ];
    const results = await this.sshService.executeCommands(server, commands);

    return {
      os: results[0].stdout.trim(),
      kernel: results[1].stdout.trim(),
      hostname: results[2].stdout.trim(),
      uptime: results[3].stdout.trim() || 'N/A',
      uptimeSeconds: parseInt(results[4].stdout.trim()) || 0,
    };
  }

  /**
   * Información de procesos
   * @param server - El servidor a obtener las métricas
   * @returns La información de procesos del servidor
   */
  async getProcessInfo(server: Server): Promise<ProcessInfoDto> {
    const commands = [
      "ps aux | wc -l | awk '{print $1-1}'",
      "ps aux | grep -c '^[^ ]* *[^ ]* *[^ ]* *R'",
      "ps aux | grep -c ' Z '",
    ];
    const results = await this.sshService.executeCommands(server, commands);

    const total = parseInt(results[0].stdout.trim()) || 0;
    const running = parseInt(results[1].stdout.trim()) || 0;
    const zombie = parseInt(results[2].stdout.trim()) || 0;

    return {
      total,
      running,
      zombie,
    };
  }

  /**
   * Obtener top procesos por CPU
   * @param server - El servidor a obtener las métricas
   * @param limit - El límite de procesos a obtener
   * @returns Los procesos más utilizados por CPU
   */
  async getTopProcessesByCpu(server: Server, limit: number = 5): Promise<any[]> {
    const command = `ps aux --sort=-%cpu | head -${limit + 1} | tail -${limit} | awk '{print $11, $3, $4}'`;
    const result = await this.sshService.executeCommand(server, command);

    const processes: { name: string; cpu: number; memory: number }[] = [];
    const lines = result.stdout.trim().split('\n');

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        processes.push({
          name: parts[0],
          cpu: parseFloat(parts[1]),
          memory: parseFloat(parts[2]),
        });
      }
    }

    return processes;
  }

  /**
   * Obtener top procesos por Memoria
   * @param server - El servidor a obtener las métricas
   * @param limit - El límite de procesos a obtener
   * @returns Los procesos más utilizados por memoria
   */
  async getTopProcessesByMemory(server: Server, limit: number = 5): Promise<any[]> {
    const command = `ps aux --sort=-%mem | head -${limit + 1} | tail -${limit} | awk '{print $11, $3, $4}'`;
    const result = await this.sshService.executeCommand(server, command);

    const processes: { name: string; cpu: number; memory: number }[] = [];
    const lines = result.stdout.trim().split('\n');

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        processes.push({
          name: parts[0],
          cpu: parseFloat(parts[1]),
          memory: parseFloat(parts[2]),
        });
      }
    }

    return processes;
  }

  /**
   * Obtener el número de servicios activos
   * @param server - El servidor a obtener las métricas
   * @returns El número de servicios activos
   */
  async getActiveServicesCount(server: Server): Promise<number> {
    try {
      // Intentar obtener el número de servicios activos con systemd
      const command = "systemctl list-units --type=service --state=running --no-pager --no-legend | wc -l"
      const result = await this.sshService.executeCommand(server, command)

      const count = parseInt(result.stdout.trim()) || 0;
      return count;
    } catch (error) {
      this.logger.warn(`No se pudo obtener el numero de servicios activos: ${error.message}`);

      // Intentar obtener el número de servicios activos con services (sistemas mas antiguos)
      try {
        const fallbackCommand = "service --status-all 2>&1 | grep '\\[ + \\]' | wc -l";
        const result = await this.sshService.executeCommand(server,fallbackCommand);
        return parseInt(result.stdout.trim()) || 0;
      } catch (fallbackError) {
        return 0;
      }
    }
  }

  /**
   * Obtener informacion de uptime formateada
   * @param server - El servidor a obtener las métricas
   * @returns La información de uptime formateada
   */
  async getUptimeInfo(server: Server): Promise<{ formatted: string; seconds: number }> {
    try {
      const commands = [
        "uptime -p | sed 's/up //'",
        "cat /proc/uptime | awk '{print $1}'",
      ]

      const results = await this.sshService.executeCommands(server, commands);

      const formatted = results[0].stdout.trim() || 'N/A'
      const seconds = parseInt(results[1].stdout.trim()) || 0
      return { formatted, seconds }
    } catch (error) {
      this.logger.warn(`No se pudo obtener la informacion de uptime: ${error.message}`);
      return { formatted: 'N/A', seconds: 0 }
    }
  }
}