import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let dataSource: { isInitialized: boolean; query: jest.Mock };

  beforeEach(async () => {
    dataSource = { isInitialized: true, query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getDataSourceToken(), useValue: dataSource },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) =>
              ({ NODE_ENV: 'test', DB_NAME: 'startcode_panel', DB_HOST: '10.0.0.5' })[key] ?? fallback),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('informa la base de datos conectada', async () => {
      const health = await appController.getHealth();

      expect(health.status).toBe('ok');
      expect(health.environment).toBe('test');
      expect(health.database).toEqual({ status: 'connected', name: 'startcode_panel', engine: 'PostgreSQL' });
    });

    it('informa desconectada si la consulta falla', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const health = await appController.getHealth();

      expect(health.database.status).toBe('disconnected');
    });

    it('no expone host, puerto, URLs ni ping (el endpoint es público)', async () => {
      const body = JSON.stringify(await appController.getHealth());

      expect(body).not.toContain('10.0.0.5');
      expect(body).not.toMatch(/"(host|port|url|api|pingMs)"/);
    });
  });
});
