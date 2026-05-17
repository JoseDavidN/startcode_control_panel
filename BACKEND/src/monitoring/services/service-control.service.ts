import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SSHService } from './ssh.service';
import { ServersService } from '@servers/servers.service';
import { ServiceAction } from '../dto/service-action.dto';

export interface ServiceActionResult {
  success: boolean;
  action: string;
  service: string;
  output: string;
}

@Injectable()
export class ServiceControlService {
  private readonly logger = new Logger(ServiceControlService.name);

  // Regex de nombres de servicio systemd válidos: letras, dígitos, punto, guion, arroba, subrayado
  private static readonly VALID_SERVICE_NAME = /^[a-zA-Z0-9._@-]+$/;

  constructor(
    private readonly sshService: SSHService,
    private readonly serversService: ServersService,
  ) {}

  async executeAction(
    serverId: string,
    userId: string,
    serviceName: string,
    action: ServiceAction,
  ): Promise<ServiceActionResult> {
    if (!ServiceControlService.VALID_SERVICE_NAME.test(serviceName)) {
      throw new BadRequestException('Nombre de servicio inválido');
    }

    const server = await this.serversService.findOneWithPrivateKey(serverId, userId);

    this.logger.log(
      `systemctl ${action} ${serviceName} en ${server.name} (${server.host})`,
    );

    const result = await this.sshService.executeCommand(
      server,
      `sudo systemctl ${action} ${serviceName}`,
    );

    const success = result.code === 0;

    if (!success) {
      this.logger.warn(
        `systemctl ${action} ${serviceName} falló (code ${result.code}): ${result.stderr}`,
      );
    }

    return {
      success,
      action,
      service: serviceName,
      output: result.stdout || result.stderr || '',
    };
  }
}
