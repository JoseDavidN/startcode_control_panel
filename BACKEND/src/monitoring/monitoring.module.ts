// src/monitoring/monitoring.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentDataService } from './services/agent-data.service';
import { ServerStatusService } from './services/server-status.service';
import { SSHService } from './services/ssh.service';
import { ServiceControlService } from './services/service-control.service';
import { DockerService } from './services/docker.service';
import { CommandService } from './services/command.service';
import { MetricsRetentionService } from './services/metrics-retention.service';
import { CommandAudit } from './entities/command-audit.entity';
import { Server } from '@servers/entities/server.entity';
import { User } from '@auth/entities/user.entity';
import { Session } from '@auth/entities/session.entity';
import { AuthModule } from '@auth/auth.module';
import { AgentMetrics } from './entities/agent-metrics.entity';
import { AgentMetricsHistory } from './entities/agent-metrics-history.entity';
import { AgentGateway } from './gateways/agent.gateway';
import { TerminalGateway } from './gateways/terminal.gateway';
import { AgentDataController } from './agent-data.controller';
import { ServersModule } from '@servers/servers.module';
import { NotificationsModule } from '@/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Server, AgentMetrics, AgentMetricsHistory, User, Session, CommandAudit]),
    AuthModule,
    forwardRef(() => ServersModule),
    NotificationsModule,
  ],
  controllers: [AgentDataController],
  providers: [
    AgentGateway,
    TerminalGateway,
    AgentDataService,
    ServerStatusService,
    SSHService,
    ServiceControlService,
    DockerService,
    CommandService,
    MetricsRetentionService,
  ],
  exports: [AgentGateway, AgentDataService, ServerStatusService, SSHService, ServiceControlService],
})
export class MonitoringModule {}
