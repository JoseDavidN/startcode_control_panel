import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { CloudConfig } from '@/common/cloud-config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CloudAuthGuard } from './cloud-auth.guard';

/* Firma y verificación fijadas a HS256: un token con otro `alg` no vale. */
export const jwtOptions = (config: CloudConfig): JwtModuleOptions => ({
  secret: config.jwtSecret,
  signOptions: { algorithm: 'HS256' },
  verifyOptions: { algorithms: ['HS256'] },
});

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CloudConfig],
      useFactory: jwtOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, CloudAuthGuard],
  exports: [AuthService, CloudAuthGuard],
})
export class AuthModule {}
