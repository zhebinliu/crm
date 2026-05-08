import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Best-effort capture of the W3C `traceparent` header for the active OTel
 * span, so the eventual webhook delivery can continue the same trace.
 * Returns undefined if OTel isn't loaded or there's no active span.
 */
function captureTraceparent(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const otel = require('@opentelemetry/api');
    const span = otel.trace?.getSpan?.(otel.context?.active?.());
    const sc = span?.spanContext?.();
    if (!sc || !sc.traceId || !sc.spanId) return undefined;
    // W3C Trace Context format: 00-<traceId>-<spanId>-<flags>
    const flags = (sc.traceFlags ?? 0).toString(16).padStart(2, '0');
    return `00-${sc.traceId}-${sc.spanId}-${flags}`;
  } catch {
    return undefined;
  }
}

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async emit(tenantId: string, eventType: string, recordType: string, recordId: string, payload: unknown) {
    // Stash the active trace context onto the event so downstream
    // consumers (event-bus, webhook delivery) can stitch the trace tree.
    const traceparent = captureTraceparent();
    const stamped: Record<string, unknown> =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? { ...(payload as Record<string, unknown>) }
        : { value: payload };
    if (traceparent && stamped['_traceparent'] === undefined) {
      stamped['_traceparent'] = traceparent;
    }

    await this.prisma.outboxEvent.create({
      data: { tenantId, eventType, recordType, recordId, payload: stamped as object },
    });
  }
}
