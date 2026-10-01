import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EMOJI_IMAGE_PATH } from './emoji/emoji.controller';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Pino Logger
  app.useLogger(app.get(Logger));

  // Shutdown'da bellekteki session'ların Firestore'a flush edilmesi için
  app.enableShutdownHooks();

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // API Prefix
  app.setGlobalPrefix('api');

  // Emoji görselleri (Fluent 3D, assets/emoji) — dosya adları içerikle
  // değişmez, uzun süre önbelleklenir. Express static guard'lardan geçmez.
  app.useStaticAssets(join(process.cwd(), 'assets', 'emoji'), {
    prefix: EMOJI_IMAGE_PATH,
    maxAge: '365d',
    immutable: true,
    index: false,
  });

  // Swagger Documentation — prod'da kapalı (auth'suz API haritası sızdırmamak için)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Geliom API')
      .setDescription('Geliom Mobile App Backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // Start server
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3045);

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Application running on port ${port}`, 'Bootstrap');
  logger.log(`Swagger docs available at /docs`, 'Bootstrap');
}

bootstrap();
