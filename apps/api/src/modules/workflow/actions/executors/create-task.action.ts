import { Injectable } from '@nestjs/common';
import type { ActionExecutor, ActionOutcome, EvalContext } from '@tokenwave/rule-engine';
import { resolveValue } from '@tokenwave/rule-engine';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ActivityType, ActivityStatus } from '@prisma/client';

// params: { subject, dueOffsetDays?, ownerId? (path ok), priority? }
@Injectable()
export class CreateTaskAction implements ActionExecutor {
  readonly type = 'create_task';
  constructor(private readonly prisma: PrismaService) {}

  async execute(params: Record<string, unknown>, ctx: EvalContext): Promise<ActionOutcome> {
    const tenantId = ctx.tenant?.id;
    const objectApiName = ctx.extra?.['objectApiName'] as string;
    const recordId = ctx.extra?.['recordId'] as string;
    if (!tenantId) return { ok: false, error: 'create_task: missing tenantId' };

    const ownerId = resolveValue(params['ownerId'] ?? '$user.id', ctx) as string;
    const subject = String(resolveValue(params['subject'] ?? 'Follow up', ctx));
    const priority = String(params['priority'] ?? 'normal');
    const dueOffsetDays = Number(params['dueOffsetDays'] ?? 1);
    const dueDate = new Date(Date.now() + dueOffsetDays * 86400_000);

    const task = await this.prisma.activity.create({
      data: {
        tenantId,
        ownerId,
        type: ActivityType.TASK,
        status: ActivityStatus.OPEN,
        subject,
        priority,
        dueDate,
        targetType: objectApiName,
        targetId: recordId,
      },
    });
    return { ok: true, data: { taskId: task.id } };
  }
}
