import { Injectable } from '@nestjs/common';
import type { ActionExecutor, ActionOutcome, EvalContext } from '@tokenwave/rule-engine';
import { resolveValue } from '@tokenwave/rule-engine';
import { RecordMutatorService } from '../../record-mutator.service';

// params: { fields: Record<string, unknown | "$path"> }
@Injectable()
export class FieldUpdateAction implements ActionExecutor {
  readonly type = 'field_update';
  constructor(private readonly mutator: RecordMutatorService) {}

  async execute(params: Record<string, unknown>, ctx: EvalContext): Promise<ActionOutcome> {
    const objectApiName = ctx.extra?.['objectApiName'] as string;
    const recordId = ctx.extra?.['recordId'] as string;
    const tenantId = ctx.tenant?.id;
    if (!objectApiName || !recordId || !tenantId) {
      return { ok: false, error: 'field_update: missing objectApiName / recordId / tenantId in ctx' };
    }
    const rawFields = params['fields'] as Record<string, unknown> | undefined;
    if (!rawFields) return { ok: false, error: 'field_update: missing params.fields' };

    // Resolve any path references in values
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawFields)) {
      resolved[k] = resolveValue(v, ctx);
    }

    await this.mutator.updateFields(objectApiName, tenantId, recordId, resolved);
    return { ok: true, data: resolved };
  }
}
