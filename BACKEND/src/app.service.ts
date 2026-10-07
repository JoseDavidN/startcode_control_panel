import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';

/* `npm_package_version` solo existe al arrancar con pnpm/npm; con
   `node dist/main` (producción) no está y se mostraba una versión inventada.
   package.json queda un nivel por encima tanto de src/ como de dist/. */
const APP_VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return process.env.npm_package_version ?? 'desconocida';
  }
})();

@Injectable()
export class AppService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth() {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        dbStatus = 'connected';
      }
    } catch {
      dbStatus = 'disconnected';
    }

    const version = APP_VERSION;
    const environment = this.configService.get<string>('NODE_ENV', 'production');

    return {
      status: 'ok',
      version,
      environment,
      uptime: Math.floor(process.uptime()),
      /* Sin host, puerto ni URLs: /health es público y no debe revelar
         dónde están la base de datos o el API. */
      database: {
        status: dbStatus,
        name: this.configService.get<string>('DB_NAME', 'startcode_panel'),
        engine: 'PostgreSQL',
      },
    };
  }
}
