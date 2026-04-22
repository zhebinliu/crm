import { Injectable, Logger } from '@nestjs/common';
import type { ActionExecutor, ActionOutcome, EvalContext } from '@tokenwave/rule-engine';

// Approval submission is circular-dep territory; we use a thin event-based approach:
// this executor emits an internal event which ApprovalService listens to.
import { EventEmitter2 } from '@nestjs/event-emitter';

// params: { approvalProcessId? } — if omitted, ApprovalService selects by object + criteria
@Injectable()
export class SubmitForApprovalAction implements ActionExecutor {
  readonly type = 'submit_for_approval';
  private readonly log = new Logger(SubmitForApprovalAction.name);
  constructor(private readonly emitter: EventEmitter2) {}

  async execute(params: Record<string, unknown>, ctx: EvalContext): Promise<ActionOutcome> {
    const objectApiName = ctx.extra?.['objectApiName'] as string;
    const recordId = ctx.extra?.['recordId'] as string;
    if (!recordId || !objectApiName) {
      return { ok: false, error: 'submit_for_approval: missing recordId / objectApiName in ctx' };
    }
    this.emitter.emit('approval.auto_submit', {
      tenantId: ctx.tenant?.id,
      submitterId: ctx.user?.id,
      objectApiName,
      recordId,
      approvalProcessId: params['approvalProcessId'],
    });
    return { ok: true };
  }
}
