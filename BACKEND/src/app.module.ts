import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ServersModule } from './servers/servers.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [AuthModule, ServersModule, MonitoringModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
