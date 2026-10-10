import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@auth/auth.module';
import { DatabasesController } from './databases.controller';
import { DatabasesService } from './databases.service';
import { DatabaseConnection } from './entities/database-connection.entity';
import { DatabaseQueryAudit } from './entities/database-query-audit.entity';
import { CredentialsCipherService } from './services/credentials-cipher.service';
import { DatabaseProbeService } from './services/database-probe.service';
import { DatabaseExplorerService } from './services/database-explorer.service';
import { PostgresExplorerService } from './services/postgres-explorer.service';
import { DatabaseSessionService } from './services/database-session.service';

@Module({
  imports: [TypeOrmModule.forFeature([DatabaseConnection, DatabaseQueryAudit]), AuthModule],
  controllers: [DatabasesController],
  providers: [DatabasesService, CredentialsCipherService, DatabaseProbeService, DatabaseExplorerService, PostgresExplorerService, DatabaseSessionService],
})
export class DatabasesModule {}
