// ─── Workflow action: ai_generate_insight ─────────────────────────────────
// Lets a workflow rule trigger an AI insight generation as part of its
// action chain. Example: when an Opportunity stage changes to "negotiation",
// auto-refresh the win-probability so the manager sees the latest scores.
//
// params:
//   kind:        OPP_WIN_PROBABILITY | OPP_ACTIVITY_SUMMARY | LEAD_SCORE | ACCOUNT_BRIEFING
//   targetType?: opportunity | lead | account   (default: derived from `kind`)
//   targetId?:   string or "$record.id" path    (default: $record.id)
//   force?:      boolean — bypass cache and regenerate
//
// On success, returns { kind, score?, band?, insightId } for downstream
// actions / debugging via the WorkflowExecution log.

import { Injectable, Logger } from '@nestjs/common';
import type { ActionExecutor, ActionOutcome, EvalContext } from '@tokenwave/rule-engine';
import { resolveValue } from '@tokenwave/rule-engine';
import { AiService } from '../../../ai/ai.service';

const KIND_TO_TARGET_TYPE: Record<string, string> = {
  OPP_WIN_PROBABILITY: 'opportunity',
  OPP_ACTIVITY_SUMMARY: 'opportunity',
  LEAD_SCORE: 'lead',
  ACCOUNT_BRIEFING: 'account',
};

@Injectable()
export class AiGenerateInsightAction implements ActionExecutor {
  readonly type = 'ai_generate_insight';
  private readonly log = new Logger('WorkflowAiGenerateInsightAction');

  constructor(private readonly ai: AiService) {}

  async execute(params: Record<string, unknown>, ctx: EvalContext): Promise<ActionOutcome> {
    const tenantId = ctx.tenant?.id;
    if (!tenantId) return { ok: false, error: 'ai_generate_insight: missing tenantId' };

    const kind = String(params['kind'] ?? '');
    if (!kind || !(kind in KIND_TO_TARGET_TYPE)) {
      return { ok: false, error: `ai_generate_insight: unknown kind "${kind}"` };
    }
    const expectedTargetType = KIND_TO_TARGET_TYPE[kind];
    const targetType = String(params['targetType'] ?? expectedTargetType);
    if (targetType !== expectedTargetType) {
      return { ok: false, error: `ai_generate_insight: kind ${kind} requires targetType=${expectedTargetType}, got ${targetType}` };
    }

    const targetId = String(resolveValue(params['targetId'] ?? '$record.id', ctx) ?? '');
    if (!targetId) return { ok: false, error: 'ai_generate_insight: targetId is empty' };

    const force = params['force'] === true;
    const userId = ctx.user?.id;

    try {
      switch (kind) {
        case 'OPP_WIN_PROBABILITY': {
          const r = await this.ai.getOppWinProbability(tenantId, targetId, { force, userId });
          return { ok: true, data: { kind, insightId: r.insight.id, score: r.payload.score, band: r.payload.band, source: r.insight.source } };
        }
        case 'OPP_ACTIVITY_SUMMARY': {
          const r = await this.ai.getOppActivitySummary(tenantId, targetId, { force, userId });
          return { ok: true, data: { kind, insightId: r.insight.id, sentiment: r.payload.sentiment, isStalled: r.payload.isStalled, source: r.insight.source } };
        }
        case 'LEAD_SCORE': {
          const r = await this.ai.getLeadScore(tenantId, targetId, { force, userId });
          return { ok: true, data: { kind, insightId: r.insight.id, score: r.payload.score, band: r.payload.band, source: r.insight.source } };
        }
        case 'ACCOUNT_BRIEFING': {
          const r = await this.ai.getAccountBriefing(tenantId, targetId, { force, userId });
          return { ok: true, data: { kind, insightId: r.insight.id, openOppsCount: r.payload.openOppsCount, source: r.insight.source } };
        }
        default:
          return { ok: false, error: `ai_generate_insight: unhandled kind ${kind}` };
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      this.log.warn(`AI action failed: kind=${kind} target=${targetType}#${targetId} :: ${msg}`);
      return { ok: false, error: `ai_generate_insight: ${msg}` };
    }
  }
}
