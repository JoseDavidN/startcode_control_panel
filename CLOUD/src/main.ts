import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'http';
import { AppModule } from './app.module';
import { resolveCorsOrigins } from './common/cors-origins';
import { APP_VERSION } from './common/version';

async function bootstrap() {
  const nodeEnv = process.env.NODE_ENV;
  const validEnvs = ['development', 'production', 'test'];
  if (!nodeEnv || !validEnvs.includes(nodeEnv)) {
    throw new Error(`NODE_ENV no está definido o es inválido: "${nodeEnv}". Valores aceptados: ${validEnvs.join(', ')}.`);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /* Private Network Access: el webview de la app de escritorio puede tratar
     `tauri.localhost` como origen público y, antes de llamar a una IP
     privada, manda una preflight que hay que aceptar (igual que BACKEND). */
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
  });

  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    /* El panel lee el nombre y el tamaño de las descargas. */
    exposedHeaders: ['Content-Disposition', 'Content-Length'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api/v1');

  /* Subidas y descargas grandes tardan más que el límite por defecto de
     Node (5 min por petición): sin límite total, pero sí para cabeceras. */
  const server: Server = app.getHttpServer();
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;

  const port = process.env.PORT ?? 3100;
  await app.listen(port);

  console.log('');
  console.log(`☁️  StartCode Cloud ${APP_VERSION}`);
  console.log(`📡 http://localhost:${port}/api/v1`);
  console.log(`🌍 ${nodeEnv}`);
  console.log('');
}
void bootstrap();
