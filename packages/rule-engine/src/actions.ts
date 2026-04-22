import type { ActionDescriptor, EvalContext } from './types';
import { evaluate } from './evaluator';

/**
 * Built-in action type identifiers. Backend services can register custom
 * action types via the ActionRegistry.
 */
export const BUILTIN_ACTION_TYPES = [
  'field_update',
  'create_task',
  'send_webhook',
  'send_email',
  'send_notification',
  'submit_for_approval',
  'emit_event',
  'log',
  'set_owner',
] as const;
export type BuiltinActionType = (typeof BUILTIN_ACTION_TYPES)[number];

/**
 * Executor contract: given the action params and eval context, perform the
 * side-effect and return a record of what happened (for audit/log).
 */
export interface ActionExecutor {
  type: string;
  execute(params: Record<string, unknown>, ctx: EvalContext): Promise<ActionOutcome>;
}

export interface ActionOutcome {
  ok: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

export class ActionRegistry {
  private readonly executors = new Map<string, ActionExecutor>();

  register(executor: ActionExecutor): void {
    this.executors.set(executor.type.toLowerCase(), executor);
  }

  get(type: string): ActionExecutor | undefined {
    return this.executors.get(type.toLowerCase());
  }

  has(type: string): boolean {
    return this.executors.has(type.toLowerCase());
  }

  /**
   * Run a list of actions sequentially. Individual action-level `if` is
   * evaluated against the provided context before execution.
   */
  async runAll(
    actions: ActionDescriptor[],
    ctx: EvalContext,
  ): Promise<Array<ActionOutcome & { type: string }>> {
    const log: Array<ActionOutcome & { type: string }> = [];
    for (const a of actions) {
      if (a.if && !evaluate(a.if, ctx)) {
        log.push({ type: a.type, ok: true, message: 'skipped: if=false' });
        continue;
      }
      const exec = this.get(a.type);
      if (!exec) {
        log.push({ type: a.type, ok: false, error: `no executor registered for "${a.type}"` });
        continue;
      }
      try {
        const out = await exec.execute(a.params ?? {}, ctx);
        log.push({ type: a.type, ...out });
      } catch (e) {
        log.push({
          type: a.type,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return log;
  }
}
