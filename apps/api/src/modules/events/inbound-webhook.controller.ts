// ─── InboundWebhookController ────────────────────────────────────────────
// Generic inbound HTTP webhook receiver. Tenants register a WebhookEndpoint
// (slug + signingSecret + dispatch settings) and downstream systems POST
// here. We:
//   1. Verify HMAC-SHA256 signature against the registered secret
//   2. Check Idempotency-Key to dedupe replays
//   3. Persist the raw event for audit
//   4. Push to the event bus so workflows / subscriptions see it
//
// Symmetric to the outbound webhook (Wave 13 — same crypto, same headers).

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from './event-bus.service';
import { Public } from '../auth/decorators/public.decorator';

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // 5 minutes

@Controller('webhooks/inbound')
export class InboundWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventBusService,
  ) {}

  /**
   * POST /webhooks/inbound/:slug
   * Headers:
   *   X-Tokenwave-Signature: sha256=<hex hmac of timestamp + "." + body>
   *   X-Tokenwave-Timestamp: <ms epoch>
   *   X-Idempotency-Key:     <opaque string>
   */
  @Public()
  @Post(':slug')
  async receive(
    @Param('slug') slug: string,
    @Headers('x-tokenwave-signature') sig: string | undefined,
    @Headers('x-tokenwave-timestamp') ts: string | undefined,
    @Headers('x-idempotency-key') idemKey: string | undefined,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    // Slug is globally unique (@unique on the column); the tenant context is
    // derived from the endpoint row, not from the request. Tenant-guard skip
    // is safe here because authentication is enforced by HMAC below.
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { slug, isActive: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ skipTenantGuard: true } as any),
    });
    if (!endpoint) throw new UnauthorizedException({ code: 'UNKNOWN_ENDPOINT' });

    // 1) Timestamp skew check (replay-attack defense)
    const tsNum = ts ? Number(ts) : NaN;
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > MAX_TIMESTAMP_SKEW_MS) {
      throw new UnauthorizedException({ code: 'TIMESTAMP_SKEW' });
    }

    // 2) HMAC verification
    if (!sig || !sig.startsWith('sha256=')) {
      throw new UnauthorizedException({ code: 'MISSING_SIGNATURE' });
    }
    // We need the raw body (pre-JSON-parse) for HMAC. Express stores it on
    // req when we register the rawBody flag in main.ts; fall back to
    // re-stringify if not present (less robust but better than rejecting).
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(body);
    const expected = createHmac('sha256', endpoint.signingSecret)
      .update(`${ts}.${rawBody}`)
      .digest();
    const provided = Buffer.from(sig.slice('sha256='.length), 'hex');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException({ code: 'BAD_SIGNATURE' });
    }

    // 3) Idempotency: dedupe replays
    const lookupKey = idemKey ?? `${slug}:${ts}:${rawBody.length}`;
    const existing = await this.prisma.webhookInboundEvent.findFirst({
      where: { tenantId: endpoint.tenantId, endpointId: endpoint.id, idempotencyKey: lookupKey },
    });
    if (existing) {
      return { ok: true, replayed: true, eventId: existing.id };
    }

    // 4) Persist + dispatch
    const stored = await this.prisma.webhookInboundEvent.create({
      data: {
        tenantId: endpoint.tenantId,
        endpointId: endpoint.id,
        idempotencyKey: lookupKey,
        headers: this.captureHeaders(req) as object,
        body: rawBody,
        receivedAt: new Date(),
      },
    });

    // 5) Push to the platform event bus so workflow rules + subscribers see it
    try {
      await this.bus.publishDirect({
        event: `Inbound.${endpoint.eventType ?? 'Webhook'}`,
        tenantId: endpoint.tenantId,
        recordType: 'inbound_webhook',
        recordId: stored.id,
        payload: typeof body === 'object' && body !== null ? body : { raw: rawBody },
        at: new Date().toISOString(),
        outboxId: stored.id,
      });
    } catch {
      // Don't 5xx if downstream fan-out fails; the event is durably stored
    }

    return { ok: true, eventId: stored.id };
  }

  private captureHeaders(req: Request): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') out[k] = v;
      else if (Array.isArray(v)) out[k] = v.join(', ');
    }
    // Strip authorization / cookies — never persist credentials
    delete out['authorization'];
    delete out['cookie'];
    delete out['x-tokenwave-signature']; // already verified
    return out;
  }
}

class _BadRequestExceptionUnused extends BadRequestException {} // placeholder to keep import used
void _BadRequestExceptionUnused;
