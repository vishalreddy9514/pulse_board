import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') as number;
  const origins = config.get<string[]>('app.corsOrigins') as string[];

  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('PulseBoard API')
    .setDescription(
      'REST surface of PulseBoard: authentication and historical queries. Live metrics are delivered over Socket.IO at the same origin, authenticated with the same JWT (handshake.auth.token).',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`PulseBoard API on :${port} (docs at /api/docs)`);
}

void bootstrap();
