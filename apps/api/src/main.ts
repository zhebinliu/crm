// OpenTelemetry MUST initialize before anything that gets auto-instrumented
// (Nest, Prisma, http, ioredis, BullMQ). Keep this as the first import.
// No-op unless OTEL_ENABLED=true.
import './tracing';
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
    // Capture raw body for inbound webhook HMAC verification.
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // /healthz/* endpoints (live, ready) sit OUTSIDE the /api prefix so K8s
  // probes can hit them at predictable paths without authn or versioning.
  app.setGlobalPrefix('api', {
    exclude: ['health', 'healthz/live', 'healthz/ready', 'graphql'],
  });

  // API versioning alias: route /api/v1/* → /api/* internally so external
  // integrations can pin a version. Existing unversioned URLs keep working
  // for backward compatibility (web app, AI Copilot built-in tools). When
  // we add v2 endpoints later, they'll get @Version('2') and be reachable
  // at /api/v2/* without affecting v1.
  const expressApp = app.getHttpAdapter().getInstance() as { use: (fn: (req: { url: string }, res: unknown, next: () => void) => void) => void };
  expressApp.use((req, _res, next) => {
    if (req.url.startsWith('/api/v1/')) {
      req.url = '/api/' + req.url.slice('/api/v1/'.length);
    }
    next();
  });
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
