// src/monitoring/monitoring.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringService } from './services/monitoring.service';
import { MonitoringController } from './monitoring.controller';
import { SSHService } from './services/ssh.service';
import { MetricsService } from './services/metrics.service';
import { Server } from '../servers/entities/server.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Server]), AuthModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, SSHService, MetricsService],
  exports: [MonitoringService, SSHService, MetricsService],
})
export class MonitoringModule {}
