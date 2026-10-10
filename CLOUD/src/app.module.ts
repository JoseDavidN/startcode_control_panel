import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health/health.controller';
import { PathsModule } from './paths/paths.module';
import { StateModule } from './state/state.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    /* Navegar una carpeta grande dispara muchas peticiones seguidas: el
       límite general es alto y el login lleva el suyo. */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    StateModule,
    AuthModule,
    PathsModule,
    FilesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
