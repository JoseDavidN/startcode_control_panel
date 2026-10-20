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
import helmet from 'helmet';
import { rejectDeepBodies } from '@/common/security/body-depth';

/**
 * `TRUST_PROXY`: saltos o rangos de proxies de confianza (`1`, `loopback`,
 * `10.0.0.0/8,127.0.0.1`…). Con proxy inverso delante, sin esto todas las
 * peticiones llegan con la IP del proxy y los límites por IP serían globales.
 * Sin valor no se confía en `X-Forwarded-For`, que cualquiera puede inventar.
 */
function trustProxyOf(
  raw = process.env.TRUST_PROXY?.trim() ?? '',
): boolean | number | string | null {
  if (!raw || raw === 'false') return null;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

async function bootstrap() {
  /* El parser se registra a mano para fijar el límite de tamaño del cuerpo. */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  /* Tras crear la app: ConfigModule ya cargó .env en process.env. */
  const nodeEnv = process.env.NODE_ENV;
  const validEnvs = ['development', 'production', 'test'];

  if (!nodeEnv || !validEnvs.includes(nodeEnv)) {
    throw new Error(
      `NODE_ENV no está definido o es inválido: "${nodeEnv}". ` +
        `Valores aceptados: ${validEnvs.join(', ')}. ` +
        `Defínelo en .env antes de arrancar.`,
    );
  }
  const production = nodeEnv === 'production';

  const bodyLimit = process.env.BODY_LIMIT?.trim() || '100kb';
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });
  app.use(rejectDeepBodies());

  const trustProxy = trustProxyOf();
  if (trustProxy !== null) {
    if (trustProxy === true) {
      console.warn(
        '[HTTP] TRUST_PROXY=true confía en cualquier X-Forwarded-For: usa el número de saltos o la IP del proxy.',
      );
    }
    app.set('trust proxy', trustProxy);
  }

  /* Cabeceras de seguridad. La API solo sirve JSON y estáticos: CSP estricta en
     producción (en desarrollo la desactiva Swagger UI, que usa scripts en línea).
     CORP cross-origin: la app de escritorio carga /public desde otro origen. */
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: production ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

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

  // Configuracion de Swagger: nunca en producción (expone el mapa completo de la API)
  if (!production) {
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
  }

  if (nodeEnv === 'development') {
    console.warn('');
    console.warn(
      '⚠️  [TypeORM] synchronize=true — el esquema se sincroniza automáticamente.',
    );
    console.warn(
      '    NO ejecutar con NODE_ENV=development en un servidor de producción.',
    );
    console.warn('');
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  console.log('');
  console.log('🚀 StartCode Panel Backend');
  console.log('================================');
  console.log(`📡 Server: http://localhost:${port}/api/v1`);
  if (!production)
    console.log(`📚 API Docs: http://localhost:${port}/api/v1/docs`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('================================');
  console.log('');
}
void bootstrap();
