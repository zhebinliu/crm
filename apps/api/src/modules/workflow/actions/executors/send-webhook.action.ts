// ─── SendWebhookAction (hardened) ────────────────────────────────────────
//
// Outbound webhook with:
//   • Idempotency-Key   — receivers can dedupe replays
//   • HMAC-SHA256 sign  — receivers can verify authenticity
//   • Exponential retry — 3 attempts (1s/2s/4s) on network/5xx/429
//   • Dead-letter queue — persists exhausted requests to webhook_dead_letters
//
// Closes audit gap "outbound webhook has no retry, no DLQ, no idempotency".

import { Injectable, Logger } from '@nestjs/common';
import type { ActionExecutor, ActionOutcome, EvalContext } from '@tokenwave/rule-engine';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../../../../prisma/prisma.service';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1_000;
const REQUEST_TIMEOUT_MS = 10_000;

interface SendOutcome {
  ok: boolean;
  status?: number;
  error?: string;
  attempts: number;
}

// params: { url, method?, headers?, bodyTemplate?, signingSecret? }
@Injectable()
export class SendWebhookAction implements ActionExecutor {
  readonly type = 'send_webhook';
  private readonly log = new Logger(SendWebhookAction.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(params: Record<string, unknown>, ctx: EvalContext): Promise<ActionOutcome> {
    const url = params['url'] as string;
    if (!url) return { ok: false, error: 'send_webhook: missing params.url' };

    const method = (params['method'] as string | undefined)?.toUpperCase() ?? 'POST';
    const baseHeaders = (params['headers'] as Record<string, string> | undefined) ?? {};
    const tenantId = ctx.tenant?.id ?? '';
    const recordId = ctx.extra?.['recordId'] as string | undefined;
    const recordType = ctx.extra?.['objectApiName'] as string | undefined;
    const event = ctx.extra?.['event'] as string | undefined;
    const workflowId = ctx.extra?.['workflowRuleId'] as string | undefined;

    // Stable idempotency key per logical event so receiver can dedupe replays.
    // Format: tenant:event:record:workflow — falls back to UUID if any piece is missing.
    const idempotencyKey =
      tenantId && event && recordId
        ? `${tenantId}:${event}:${recordId}:${workflowId ?? 'manual'}`
        : randomUUID();

    const body = JSON.stringify({
      event,
      objectApiName: recordType,
      recordId,
      tenantId,
      userId: ctx.user?.id,
      record: ctx.record,
      ...(params['bodyTemplate'] as Record<string, unknown> | undefined),
    });

    const timestamp = Date.now().toString();
    const secret = (params['signingSecret'] as string | undefined) ?? process.env.WEBHOOK_SIGNING_SECRET ?? '';
    const signature = secret
      ? createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
      : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
      'X-Tokenwave-Timestamp': timestamp,
      ...(signature ? { 'X-Tokenwave-Signature': `sha256=${signature}` } : {}),
      ...baseHeaders,
    };

    const result = await this.sendWithRetry(url, method, headers, body);

    if (!result.ok) {
      // Park to DLQ for operator inspection/replay
      try {
        await this.prisma.webhookDeadLetter.create({
          data: {
            tenantId,
            url,
            method,
            headers: headers as object,
            body,
            attempts: result.attempts,
            lastStatus: result.status ?? null,
            lastError: result.error ?? null,
            idempotencyKey,
            workflowId: workflowId ?? null,
            recordType: recordType ?? null,
            recordId: recordId ?? null,
          },
        });
      } catch (e) {
        this.log.error(`Failed to persist webhook DLQ entry: ${(e as Error).message}`);
      }
    }

    return {
      ok: result.ok,
      data: { status: result.status, attempts: result.attempts, idempotencyKey },
      message: result.ok ? undefined : result.error ?? `HTTP ${result.status}`,
      error: result.ok ? undefined : result.error,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async sendWithRetry(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<SendOutcome> {
    let lastError: string | undefined;
    let lastStatus: number | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const res = await fetch(url, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        lastStatus = res.status;
        if (res.ok) return { ok: true, status: res.status, attempts: attempt };
        // Retry only on 5xx and 429; 4xx (except 429) is permanent.
        if (res.status < 500 && res.status !== 429) {
          return { ok: false, status: res.status, error: `HTTP ${res.status}`, attempts: attempt };
        }
        lastError = `HTTP ${res.status}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      if (attempt < MAX_ATTEMPTS) {
        // 1s, 2s, 4s exponential backoff with ±25% jitter
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        const jitter = backoff * (0.5 * Math.random());
        await new Promise((r) => setTimeout(r, backoff + jitter));
      }
    }
    this.log.warn(`send_webhook to ${url} exhausted ${MAX_ATTEMPTS} attempts: ${lastError}`);
    return { ok: false, status: lastStatus, error: lastError, attempts: MAX_ATTEMPTS };
  }
}
