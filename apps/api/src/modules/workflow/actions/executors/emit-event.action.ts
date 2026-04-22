import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ActionExecutor, ActionOutcome, EvalContext } from '@tokenwave/rule-engine';

// params: { eventName, payload? }
@Injectable()
export class EmitEventAction implements ActionExecutor {
  readonly type = 'emit_event';
  constructor(private readonly emitter: EventEmitter2) {}

  async execute(params: Record<string, unknown>, ctx: EvalContext): Promise<ActionOutcome> {
    const eventName = params['eventName'] as string;
    if (!eventName) return { ok: false, error: 'emit_event: missing params.eventName' };
    this.emitter.emit(eventName, { ...(params['payload'] as object | undefined), ctx });
    return { ok: true };
  }
}
