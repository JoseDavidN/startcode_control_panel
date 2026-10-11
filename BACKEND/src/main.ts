/* Antes que nada: fija cómo sale a internet (VPN) para todo el backend. */
import './network-defaults';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { CorsIoAdapter } from './adapters/cors-io.adapter';
import { resolveCorsOrigins } from './adapters/cors-origins';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Servir archivos estáticos desde la carpeta public
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/public/',
  });

  /* Private Network Access: el webview de la app de escritorio (WebView2 en
     Windows) puede tratar `tauri.localhost` como origen público y, antes de
     llamar a una IP privada (LAN, Tailscale), manda una preflight con
     `Access-Control-Request-Private-Network`. Sin esta respuesta la bloquea
     y la app ve "sin respuesta", aunque el navegador sí conecte. Va antes de
     enableCors, que es quien cierra la preflight. */
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
  });

  // CORS HTTP — misma lista que el WebSocket, con los orígenes de Tauri.
  // Antes se pasaba la cadena cruda: con varios orígenes separados por coma
  // no coincidía ninguno.
  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // CORS WebSocket — adapter lee CORS_ORIGIN en bootstrap, no en tiempo de decorador
  app.useWebSocketAdapter(new CorsIoAdapter(app));

  // Validacion Global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina los campos que no estan en el DTO
      forbidNonWhitelisted: true, // Lanza un error si se envian campos que no estan en el DTO
      transform: true, // Transforma los datos a los tipos de los DTOs
      transformOptions: {
        enableImplicitConversion: true, // Transforma los datos a los tipos de los DTOs
      },
    }),
  );

  // Prefijo global para todas las rutas
  app.setGlobalPrefix('api/v1');

  // Configuracion de Swagger
  const config = new DocumentBuilder()
    .setTitle('StartCode Panel API')
    .setDescription('API para administracion y gestion de servidores')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT-auth',
        description: 'JWT Authorization header using the Bearer scheme',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Endpoints de autenticacion y autorizacion')
    .addTag('Servers', 'Gestion de servidores')
    .addTag('Monitoring', 'Monitoreo y metricas de servidores')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document, {
    customSiteTitle: 'StartCode Panel - API Documentation',
    customCssUrl: '/public/swagger-theme.css',
    customfavIcon: '/public/favicon_black.png',
  });

  const nodeEnv = process.env.NODE_ENV;
  const validEnvs = ['development', 'production', 'test'];

  if (!nodeEnv || !validEnvs.includes(nodeEnv)) {
    throw new Error(
      `NODE_ENV no está definido o es inválido: "${nodeEnv}". ` +
      `Valores aceptados: ${validEnvs.join(', ')}. ` +
      `Defínelo en .env antes de arrancar.`,
    );
  }

  if (nodeEnv === 'development') {
    console.warn('');
    console.warn('⚠️  [TypeORM] synchronize=true — el esquema se sincroniza automáticamente.');
    console.warn('    NO ejecutar con NODE_ENV=development en un servidor de producción.');
    console.warn('');
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  console.log('');
  console.log('🚀 StartCode Panel Backend');
  console.log('================================');
  console.log(`📡 Server: http://localhost:${port}/api/v1`);
  console.log(`📚 API Docs: http://localhost:${port}/api/v1/docs`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('================================');
  console.log('');
}
bootstrap();
