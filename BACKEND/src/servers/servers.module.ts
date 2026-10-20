import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { AgentController } from './agent.controller';
import { AgentReleasesController } from './agent-releases.controller';
import { AgentInstallService } from './services/agent-install.service';
import { AgentBinariesService } from './services/agent-binaries.service';
import { AgentInstallTokenGuard } from './guards/agent-install-token.guard';
import { Server } from './entities/server.entity';
import { AuthModule } from '@auth/auth.module';
import { MonitoringModule } from '@monitoring/monitoring.module';
import { DatabasesModule } from '@/databases/databases.module';
import { NotificationsModule } from '@/notifications/notifications.module';
import { HostKeyService } from '@servers/services/host-key.service';
import { AgentTokenService } from '@servers/services/agent-token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Server]),
    AuthModule,
    /* Por `CredentialsCipherService`: la llave SSH se guarda cifrada. */
    forwardRef(() => DatabasesModule),
    forwardRef(() => MonitoringModule),
    /* La aceptación de una clave de host nueva queda como aviso de seguridad. */
    NotificationsModule,
  ],
  controllers: [ServersController, AgentController, AgentReleasesController],
  providers: [
    ServersService,
    AgentInstallService,
    AgentBinariesService,
    AgentInstallTokenGuard,
    HostKeyService,
    AgentTokenService,
  ],
  exports: [ServersService, AgentInstallService, AgentBinariesService, AgentTokenService],
})
export class ServersModule {}
