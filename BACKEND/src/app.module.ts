import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ServersModule } from './servers/servers.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    // Configuracion Global de variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

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
        synchronize: ConfigService.get('NODE_ENV') === 'development',
        logging: ConfigService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Modulos de la aplicacion
    AuthModule,
    ServersModule,
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
