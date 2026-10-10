import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { APP_VERSION } from '@/common/version';

/** Público: el panel lo usa para comprobar que la URL es una StartCode Cloud. */
@Controller('health')
export class HealthController {
  @Get()
  @SkipThrottle()
  health() {
    return { service: 'startcode-cloud', version: APP_VERSION, time: new Date().toISOString() };
  }
}
