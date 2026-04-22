import { Injectable, Logger } from '@nestjs/common';
import type { ActionExecutor, ActionOutcome, EvalContext } from '@tokenwave/rule-engine';
import { resolveValue } from '@tokenwave/rule-engine';
import { PrismaService } from '../../../../prisma/prisma.service';

// params: { toUserId (path ok), subject, body, channel? }
// Stored in DB as a notification record; future: push via websocket / email.
@Injectable()
export class SendNotificationAction implements ActionExecutor {
  readonly type = 'send_notification';
  private readonly log = new Logger(SendNotificationAction.name);
  constructor(private readonly prisma: PrismaService) {}

  async execute(params: Record<string, unknown>, ctx: EvalContext): Promise<ActionOutcome> {
    const toUserId = resolveValue(params['toUserId'], ctx) as string | undefined;
    if (!toUserId) return { ok: false, error: 'send_notification: could not resolve toUserId' };
    const subject = String(resolveValue(params['subject'] ?? 'CRM Notification', ctx));
    const body = String(resolveValue(params['body'] ?? '', ctx));

    await this.prisma.note.create({
      data: {
        tenantId: ctx.tenant?.id ?? '',
        authorId: ctx.user?.id ?? toUserId,
        title: `[通知] ${subject}`,
        body,
        targetType: '_notification',
        targetId: toUserId,
      },
    });
    this.log.log(`Notification sent → user ${toUserId}: ${subject}`);
    return { ok: true };
  }
}
