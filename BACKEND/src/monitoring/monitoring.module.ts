// src/monitoring/monitoring.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentDataService } from './services/agent-data.service';
import { ServerStatusService } from './services/server-status.service';
import { SSHService } from './services/ssh.service';
import { ServiceControlService } from './services/service-control.service';
import { Server } from '@servers/entities/server.entity';
import { AuthModule } from '@auth/auth.module';
import { AgentMetrics } from './entities/agent-metrics.entity';
import { AgentMetricsHistory } from './entities/agent-metrics-history.entity';
import { AgentGateway } from './gateways/agent.gateway';
import { AgentDataController } from './agent-data.controller';
import { ServersModule } from '@servers/servers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Server, AgentMetrics, AgentMetricsHistory]),
    AuthModule,
    forwardRef(() => ServersModule),
  ],
  controllers: [AgentDataController],
  providers: [AgentGateway, AgentDataService, ServerStatusService, SSHService, ServiceControlService],
  exports: [AgentGateway, AgentDataService, ServerStatusService, SSHService, ServiceControlService],
})
export class MonitoringModule {}
