import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CloudConfig } from '@/common/cloud-config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CloudAuthGuard } from './cloud-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CloudConfig],
      useFactory: (config: CloudConfig) => ({ secret: config.jwtSecret, signOptions: { algorithm: 'HS256' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, CloudAuthGuard],
  exports: [AuthService, CloudAuthGuard],
})
export class AuthModule {}
