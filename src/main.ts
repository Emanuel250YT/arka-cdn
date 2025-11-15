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
      'API REST para almacenamiento descentralizado de archivos y streaming de video con DASH. Integrado con Arkiv Network y Prisma.',
    )
    .setVersion('1.0')
    .addTag('health', 'Health check endpoints')
    .addTag('auth', 'Autenticación y gestión de usuarios')
    .addTag('users', 'Gestión de usuarios')
    .addTag('Upload', 'Subida de archivos y conversión de video a streaming DASH')
    .addTag('blockchain', 'Interacción con smart contracts')
    .addBearerAuth()
    .build();


  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}/api`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
  console.log(`📦 Arkiv Network CDN with DASH streaming enabled`);
}
bootstrap();
