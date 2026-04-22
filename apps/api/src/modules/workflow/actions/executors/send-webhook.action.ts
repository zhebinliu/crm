import { Injectable, Logger } from '@nestjs/common';
import type { ActionExecutor, ActionOutcome, EvalContext } from '@tokenwave/rule-engine';

// params: { url, method?, headers?, bodyTemplate? }
@Injectable()
export class SendWebhookAction implements ActionExecutor {
  readonly type = 'send_webhook';
  private readonly log = new Logger(SendWebhookAction.name);

  async execute(params: Record<string, unknown>, ctx: EvalContext): Promise<ActionOutcome> {
    const url = params['url'] as string;
    if (!url) return { ok: false, error: 'send_webhook: missing params.url' };

    const method = (params['method'] as string | undefined)?.toUpperCase() ?? 'POST';
    const headers = (params['headers'] as Record<string, string> | undefined) ?? {};
    const body = JSON.stringify({
      event: ctx.extra?.['event'],
      objectApiName: ctx.extra?.['objectApiName'],
      recordId: ctx.extra?.['recordId'],
      tenantId: ctx.tenant?.id,
      userId: ctx.user?.id,
      record: ctx.record,
      ...(params['bodyTemplate'] as Record<string, unknown> | undefined),
    });

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, data: { status: res.status }, message: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`send_webhook to ${url} failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
