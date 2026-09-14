import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

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
    let dbPingMs: number | null = null;

    try {
      if (this.dataSource.isInitialized) {
        const t0 = Date.now();
        await this.dataSource.query('SELECT 1');
        dbPingMs = Date.now() - t0;
        dbStatus = 'connected';
      }
    } catch {
      dbStatus = 'disconnected';
    }

    const version = process.env.npm_package_version ?? '1.0.0';
    const environment = this.configService.get<string>('NODE_ENV', 'production');
    const port = this.configService.get('PORT', 3001);

    return {
      status: 'ok',
      version,
      environment,
      uptime: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        pingMs: dbPingMs,
        host: this.configService.get<string>('DB_HOST', 'localhost'),
        port: Number(this.configService.get('DB_PORT', 5432)),
        name: this.configService.get<string>('DB_NAME', 'startcode_panel'),
        engine: 'PostgreSQL',
      },
      api: {
        url: `http://localhost:${port}/api/v1`,
        port: Number(port),
      },
    };
  }
}
