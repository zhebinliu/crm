import { Injectable, Logger } from '@nestjs/common';
import type { ActionExecutor, ActionOutcome, EvalContext } from '@tokenwave/rule-engine';

// params: { level?, message }
@Injectable()
export class LogAction implements ActionExecutor {
  readonly type = 'log';
  private readonly log = new Logger('WorkflowLogAction');

  async execute(params: Record<string, unknown>, _ctx: EvalContext): Promise<ActionOutcome> {
    const level = (params['level'] as string | undefined) ?? 'log';
    const message = String(params['message'] ?? '(no message)');
    (this.log as unknown as Record<string, (m: string) => void>)[level]?.(message) ?? this.log.log(message);
    return { ok: true };
  }
}
