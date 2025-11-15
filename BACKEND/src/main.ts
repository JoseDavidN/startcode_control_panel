import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Servir archivos estáticos desde la carpeta public
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/public/',
  });

  // Cors
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

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
