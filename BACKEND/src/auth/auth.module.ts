import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';
import { RolesGuard } from './roles/roles.guard';
import { DefaultUserSeeder } from './seeders/default-user.seeder';
import { WsAuthService } from './ws-auth.service';
import { SessionSocketsService } from '@auth/session-sockets.service';
import { JWT_ALGORITHM, jwtSecretOf } from '@auth/jwt-config';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        /* Falla al arrancar con un secreto ausente, corto o de ejemplo. */
        secret: jwtSecretOf(configService),
        signOptions: {
          algorithm: JWT_ALGORITHM,
          expiresIn: configService.get('JWT_EXPIRES_IN', '30m'),
        },
        /* Se fusiona en cada `jwtService.verify` del proyecto: ningún token con otro `alg`. */
        verifyOptions: { algorithms: [JWT_ALGORITHM] },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard, DefaultUserSeeder, WsAuthService, SessionSocketsService],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule, WsAuthService, SessionSocketsService],
})
export class AuthModule {}
