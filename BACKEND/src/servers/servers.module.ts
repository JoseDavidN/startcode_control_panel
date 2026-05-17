import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { Server } from './entities/server.entity';
import { AuthModule } from '@auth/auth.module';
import { MonitoringModule } from '@monitoring/monitoring.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Server]),
    AuthModule,
    forwardRef(() => MonitoringModule),
  ],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
