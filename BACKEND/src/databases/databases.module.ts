import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@auth/auth.module';
import { MonitoringModule } from '@monitoring/monitoring.module';
import { Server } from '@servers/entities/server.entity';
import { DatabasesController } from './databases.controller';
import { DatabasesService } from './databases.service';
import { DatabaseConnection } from './entities/database-connection.entity';
import { DatabaseQueryAudit } from './entities/database-query-audit.entity';
import { CredentialsCipherService } from './services/credentials-cipher.service';
import { DatabaseProbeService } from './services/database-probe.service';
import { DatabaseExplorerService } from './services/database-explorer.service';
import { PostgresExplorerService } from './services/postgres-explorer.service';
import { DatabaseSessionService } from './services/database-session.service';
import { RedisExplorerService } from './services/redis-explorer.service';
import { DatabaseTunnelService } from './services/database-tunnel.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DatabaseConnection, DatabaseQueryAudit, Server]),
    AuthModule,
    /* Por `SSHService`: los túneles SSH pasan por la misma verificación de huella. */
    forwardRef(() => MonitoringModule),
  ],
  controllers: [DatabasesController],
  providers: [DatabasesService, CredentialsCipherService, DatabaseProbeService, DatabaseExplorerService, PostgresExplorerService, DatabaseSessionService, RedisExplorerService, DatabaseTunnelService],
  exports: [CredentialsCipherService, DatabasesService],
})
export class DatabasesModule {}
