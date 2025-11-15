import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
  });

  // Increase body size limit for large file uploads
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ limit: '500mb', extended: true }));

  // Enable CORS
  app.enableCors();

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );


  const config = new DocumentBuilder()
    .setTitle('Arka CDN - Arkiv Network Storage API')
    .setDescription(
      `API REST para almacenamiento descentralizado de archivos y streaming de video. 
      
**Características principales:**
- Almacenamiento descentralizado en Arkiv Network
- Compresión automática de imágenes y videos
- Subida de archivos plain text y JSON
- Sistema de chunks para archivos grandes
- TTL (Time To Live) para archivos temporales
- URLs públicas para compartir archivos

**Base URL:** \`/api\`

**Autenticación:** Bearer Token (JWT)`,
    )
    .setVersion('1.0')
    .setContact(
      'Support',
      'https://github.com/Emanuel250YT/arka-cdn',
      'support@example.com',
    )
    .addTag('health', 'Health check endpoints')
    .addTag('auth', 'Autenticación y gestión de usuarios')
    .addTag('Upload', 'Subida y gestión de archivos (requiere autenticación)')
    .addTag('Data', 'Acceso público a archivos (no requiere autenticación)')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}/api`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api-docs`);
  console.log(`📦 Arkiv Network CDN with DASH streaming enabled`);
}
bootstrap();
