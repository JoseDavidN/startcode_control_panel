import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ServersModule } from './servers/servers.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { SftpModule } from './sftp/sftp.module';
import { CacheModule } from './cache/cache.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    // Configuracion Global de variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Habilitar tareas programadas (cron jobs)
    ScheduleModule.forRoot(),

    /* Límite global de peticiones. Los endpoints sensibles (login, 2FA,
       refresh) lo estrechan con @Throttle en su propio controlador. */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    // Configuracion de TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (ConfigService: ConfigService) => ({
        type: 'postgres',
        host: ConfigService.get('DB_HOST', 'localhost'),
        port: ConfigService.get('DB_PORT', 5432),
        username: ConfigService.get('DB_USERNAME', 'postgres'),
        password: ConfigService.get('DB_PASSWORD', 'password'),
        database: ConfigService.get('DB_NAME', 'startcode_panel'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: ConfigService.get('NODE_ENV', 'production') === 'development',
        logging: ConfigService.get('NODE_ENV', 'production') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Modulos de la aplicacion
    CacheModule,
    AuthModule,
    ServersModule,
    MonitoringModule,
    SftpModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
