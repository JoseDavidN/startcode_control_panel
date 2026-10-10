import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { APP_VERSION } from '@/common/version';
import { AuthService } from './auth.service';
import { CloudAuthGuard } from './cloud-auth.guard';
import { LoginDto } from './dto/login.dto';
import type { AuthedRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /* Pocas pruebas por minuto: frena el ataque de diccionario. */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password, dto.deviceName);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(CloudAuthGuard)
  async logout(@Req() req: AuthedRequest): Promise<void> {
    await this.auth.logout(req.user);
  }

  @Get('me')
  @UseGuards(CloudAuthGuard)
  me(@Req() req: AuthedRequest) {
    return { username: req.user.username, version: APP_VERSION };
  }
}
