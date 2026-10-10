import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@auth/auth.module';
import { Server } from '@servers/entities/server.entity';
import { AgentMetrics } from '@monitoring/entities/agent-metrics.entity';
import { CommandAudit } from '@monitoring/entities/command-audit.entity';
import { DatabasesModule } from '@/databases/databases.module';
import { DatabaseConnection } from '@/databases/entities/database-connection.entity';
import { DatabaseQueryAudit } from '@/databases/entities/database-query-audit.entity';
import { Notification } from '@/notifications/entities/notification.entity';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AiAssistantConfig } from './entities/ai-assistant-config.entity';
import { AiAssistantMessage } from './entities/ai-assistant-message.entity';
import { AiAssistantMemory } from './entities/ai-assistant-memory.entity';
import { AiProviderService } from './services/ai-provider.service';
import { AssistantContextService } from './services/assistant-context.service';
import { AssistantMemoryService } from './services/assistant-memory.service';
import { AssistantSchemaService } from './services/assistant-schema.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiAssistantConfig,
      AiAssistantMessage,
      AiAssistantMemory,
      Server,
      AgentMetrics,
      CommandAudit,
      DatabaseConnection,
      DatabaseQueryAudit,
      Notification,
    ]),
    AuthModule,
    /* Por `CredentialsCipherService` (la clave de API se cifra igual que las contraseñas
       de las bases) y `DatabasesService` (estructura real de la base abierta). */
    DatabasesModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService, AiProviderService, AssistantContextService, AssistantMemoryService, AssistantSchemaService],
})
export class AssistantModule {}
