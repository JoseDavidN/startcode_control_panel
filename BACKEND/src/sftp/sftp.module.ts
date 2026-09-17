// src/sftp/sftp.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '@auth/auth.module';
import { ServersModule } from '@servers/servers.module';
import { MonitoringModule } from '@monitoring/monitoring.module';
import { SftpGateway } from './sftp.gateway';
import { SftpController } from './sftp.controller';
import { SftpSessionService } from './services/sftp-session.service';
import { SftpOperationsService } from './services/sftp-operations.service';

/**
 * Transferencia de archivos por SFTP sobre la conexión SSH del servidor.
 *
 * Reutiliza `SSHService` del módulo de monitoreo (misma llave, mismas opciones
 * de conexión) y `ServersService` para la comprobación de propiedad.
 */
@Module({
  imports: [AuthModule, ServersModule, MonitoringModule],
  controllers: [SftpController],
  providers: [SftpGateway, SftpSessionService, SftpOperationsService],
})
export class SftpModule {}
