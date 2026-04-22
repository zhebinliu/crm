import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api', { exclude: ['health', 'graphql'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const origins = (config.get<string>('API_CORS_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim());
  app.enableCors({ origin: origins, credentials: true });

  const swaggerCfg = new DocumentBuilder()
    .setTitle('Tokenwave CRM API')
    .setDescription('Salesforce-style headless CRM')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerCfg);
  SwaggerModule.setup('api/docs', app, doc);

  const port = Number(config.get('API_PORT') ?? 3001);
  const host = config.get<string>('API_HOST') ?? '0.0.0.0';
  await app.listen(port, host);

  const log = new Logger('Bootstrap');
  log.log(`Tokenwave CRM API listening on http://${host}:${port}`);
  log.log(`Swagger: http://${host}:${port}/api/docs`);
  log.log(`GraphQL: http://${host}:${port}/graphql`);
}
bootstrap();
