// ─── OpenTelemetry SDK bootstrap ─────────────────────────────────────────
//
// MUST be imported at the very top of main.ts BEFORE @nestjs/core, Prisma,
// or any other instrumented module loads — auto-instrumentations patch
// require() at module-load time, so loading them late means missed spans.
//
// OFF by default to avoid unconditional spans in dev. Enable with:
//   OTEL_ENABLED=true
//   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces  (default)
//
// Wave 18e (observability).

/* eslint-disable @typescript-eslint/no-var-requires */

if (process.env.OTEL_ENABLED === 'true') {
  try {
    // Lazy require: keeps ~80MB of OTel out of the dev hot-reload path
    // and means a missing dep won't break boot when OTEL_ENABLED is unset.
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const resourcesPkg = require('@opentelemetry/resources');
    const semconv = require('@opentelemetry/semantic-conventions');
    const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');

    // Cross-version: resource API changed between OTel SDK 1.x and 2.x.
    // 2.x ships `resourceFromAttributes()`; 1.x ships `new Resource()`.
    const buildResource = (attrs: Record<string, string>) => {
      if (typeof resourcesPkg.resourceFromAttributes === 'function') {
        return resourcesPkg.resourceFromAttributes(attrs);
      }
      if (typeof resourcesPkg.Resource === 'function') {
        return new resourcesPkg.Resource(attrs);
      }
      return undefined;
    };

    // Cross-version semantic-conv attribute keys.
    const KEY_SERVICE_NAME =
      semconv.ATTR_SERVICE_NAME ?? semconv.SEMRESATTRS_SERVICE_NAME ?? 'service.name';
    const KEY_SERVICE_VERSION =
      semconv.ATTR_SERVICE_VERSION ?? semconv.SEMRESATTRS_SERVICE_VERSION ?? 'service.version';
    const KEY_DEPLOYMENT_ENV =
      semconv.SEMRESATTRS_DEPLOYMENT_ENVIRONMENT ?? 'deployment.environment';

    // Mute the noisy "ECONNREFUSED" stack the exporter logs on every flush
    // when no collector is running — log it once at WARN instead.
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

    const endpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces';

    const sdk = new NodeSDK({
      resource: buildResource({
        [KEY_SERVICE_NAME]: 'tokenwave-crm-api',
        [KEY_SERVICE_VERSION]: process.env.npm_package_version ?? '0.1.0',
        [KEY_DEPLOYMENT_ENV]: process.env.NODE_ENV ?? 'development',
      }),
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // HTTP, Express, Nest, ioredis, BullMQ are auto-included.
          // Enable Prisma explicitly (it ships under @prisma/instrumentation
          // not the auto bundle, but auto-instrumentations also picks it up).
          '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    });

    try {
      sdk.start();
      // eslint-disable-next-line no-console
      console.log(`[otel] tracing enabled → ${endpoint}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[otel] failed to start SDK: ${(err as Error).message}`);
    }

    // Graceful shutdown — flush spans on SIGTERM/SIGINT/exit so the last
    // few seconds of activity actually reach the collector.
    const shutdown = async () => {
      try {
        await sdk.shutdown();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[otel] shutdown error: ${(err as Error).message}`);
      }
    };
    process.once('SIGTERM', () => {
      shutdown().finally(() => process.exit(0));
    });
    process.once('SIGINT', () => {
      shutdown().finally(() => process.exit(0));
    });
    process.once('beforeExit', shutdown);
  } catch (err) {
    // OTel deps missing or broken — never fail boot for a tracing module.
    // eslint-disable-next-line no-console
    console.warn(`[otel] disabled (init error): ${(err as Error).message}`);
  }
}
