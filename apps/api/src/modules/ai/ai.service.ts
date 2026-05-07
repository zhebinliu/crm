// ─── AI orchestration service ───────────────────────────────────────────────
//
// Single entry point for all "give me an AI insight on this record" calls.
//
// Flow:
//   1. Build context (delegated to AiContextService).
//   2. Compute inputHash from context.
//   3. If cached AIInsight exists and inputHash matches and not expired → return.
//   4. Else: build prompt → call ClaudeClient → if live, parse JSON; if stub or
//      JSON parse fails, fall back to deterministic heuristic.
//   5. Persist result (upsert by tenant+target+kind), return.
//
// The cache TTL is short (30 min default) because opportunity context changes
// fast — a user expects "regenerate" to feel responsive.

import { Injectable, Logger } from '@nestjs/common';
import { AIInsightKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeClient } from './claude.client';
import { AiContextService } from './ai-context.service';
import {
  OPP_WIN_PROBABILITY_SYSTEM,
  buildOppWinProbabilityUser,
} from './prompts/opportunity-win-probability.prompt';
import {
  OPP_ACTIVITY_SUMMARY_SYSTEM,
  buildOppActivitySummaryUser,
} from './prompts/opportunity-activity-summary.prompt';
import {
  LEAD_SCORE_SYSTEM,
  buildLeadScoreUser,
} from './prompts/lead-score.prompt';
import {
  ACCOUNT_BRIEFING_SYSTEM,
  buildAccountBriefingUser,
} from './prompts/account-briefing.prompt';
import {
  LEAD_OUTREACH_SYSTEM,
  buildLeadOutreachUser,
  type OutreachChannel,
  type OutreachTone,
} from './prompts/lead-outreach-draft.prompt';
import {
  heuristicOppWinProbability,
  heuristicOppActivitySummary,
  heuristicLeadScore,
  heuristicAccountBriefing,
  heuristicLeadOutreach,
} from './heuristics';
import type {
  OppWinProbabilityPayload,
  OppActivitySummaryPayload,
  LeadScorePayload,
  AccountBriefingPayload,
} from './ai.types';

interface OutreachDraftResult {
  channel: OutreachChannel;
  subject: string;
  body: string;
  reasoning: string;
  modelName: string;
  source: 'live' | 'stub' | 'heuristic';
  latencyMs: number;
}

interface PipelineRiskItem {
  opportunity: {
    id: string;
    name: string;
    stage: string;
    amount: number | null;
    currencyCode: string;
    closeDate: string;
    daysToClose: number;
    owner: { id: string; displayName: string } | null;
    account: { id: string; name: string } | null;
    probability: number;
  };
  insight: {
    score: number;
    band: 'low' | 'medium' | 'high';
    headline: string;
    riskFactors: string[];
    nextActions: { action: string; reason: string }[];
    generatedAt: string;
    modelName: string;
    cached: boolean;
    source: 'live' | 'stub';
  } | null;
}

interface PipelineRiskStats {
  total: number;
  analyzed: number;
  highRisk: number;     // band === 'low'
  mediumRisk: number;   // band === 'medium'
  healthy: number;      // band === 'high'
  unanalyzed: number;
  totalAmount: number;
  atRiskAmount: number; // sum of amounts where band === 'low'
}

export interface TelemetrySummary {
  totals: {
    insights: number;
    promptTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    avgLatencyMs: number;
    liveCount: number;
    stubCount: number;
    cacheHitRate: number; // 0..1
  };
  byKind: Array<{
    kind: string;
    count: number;
    promptTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    avgLatencyMs: number;
  }>;
  byDay: Array<{
    day: string;
    count: number;
    promptTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  }>;
  since: string;
  windowDays: number;
}

function toBand(payload: OppWinProbabilityPayload) {
  return {
    score: payload.score,
    band: payload.band,
    headline: payload.headline,
    topRisk: payload.riskFactors?.[0] ?? null,
    topAction: payload.nextActions?.[0]?.action ?? null,
  };
}

function emptyRiskStats(): PipelineRiskStats {
  return {
    total: 0, analyzed: 0, highRisk: 0, mediumRisk: 0, healthy: 0,
    unanalyzed: 0, totalAmount: 0, atRiskAmount: 0,
  };
}

function computeRiskStats(items: PipelineRiskItem[]): PipelineRiskStats {
  const stats = emptyRiskStats();
  for (const it of items) {
    stats.total += 1;
    stats.totalAmount += it.opportunity.amount ?? 0;
    if (!it.insight) {
      stats.unanalyzed += 1;
      continue;
    }
    stats.analyzed += 1;
    if (it.insight.band === 'low') {
      stats.highRisk += 1;
      stats.atRiskAmount += it.opportunity.amount ?? 0;
    } else if (it.insight.band === 'medium') {
      stats.mediumRisk += 1;
    } else {
      stats.healthy += 1;
    }
  }
  return stats;
}

const TTL_MS = 30 * 60 * 1000; // 30 min — bumped for any "fresh" check.

interface InsightEnvelope<T> {
  payload: T;
  insight: {
    id: string;
    targetType: string;
    targetId: string;
    kind: AIInsightKind;
    modelName: string;
    generatedAt: string;
    expiresAt: string | null;
    cached: boolean;
    source: 'live' | 'stub' | 'heuristic';
    latencyMs: number;
    summary: string | null;
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeClient,
    private readonly ctxBuilder: AiContextService,
  ) {}

  // ── Opportunity Win Probability ────────────────────────────────────────────

  async getOppWinProbability(
    tenantId: string,
    oppId: string,
    opts: { force?: boolean; userId?: string } = {},
  ): Promise<InsightEnvelope<OppWinProbabilityPayload>> {
    const ctx = await this.ctxBuilder.buildOpportunityContext(tenantId, oppId);
    const inputHash = this.ctxBuilder.hashContext(ctx);

    if (!opts.force) {
      const cached = await this.findFresh(tenantId, 'opportunity', oppId, AIInsightKind.OPP_WIN_PROBABILITY, inputHash);
      if (cached) return this.envelope<OppWinProbabilityPayload>(cached, true);
    }

    const t0 = Date.now();
    const result = await this.claude.complete<OppWinProbabilityPayload>({
      system: OPP_WIN_PROBABILITY_SYSTEM,
      user: buildOppWinProbabilityUser(ctx),
      prefill: '{',
      maxTokens: 1024,
    });

    let payload: OppWinProbabilityPayload;
    let source: 'live' | 'stub' | 'heuristic';
    if (result.source === 'live' && result.json && this.validateOppWinProb(result.json)) {
      payload = result.json;
      source = 'live';
    } else {
      payload = heuristicOppWinProbability(ctx);
      source = result.source === 'live' ? 'heuristic' : 'stub';
      if (result.source === 'live') {
        this.logger.warn(`OPP_WIN_PROBABILITY model output invalid; falling back to heuristic. opp=${oppId}`);
      }
    }

    const persisted = await this.persist({
      tenantId,
      targetType: 'opportunity',
      targetId: oppId,
      kind: AIInsightKind.OPP_WIN_PROBABILITY,
      payload,
      summary: payload.headline,
      modelName: result.modelName,
      usage: result.usage,
      latencyMs: Date.now() - t0,
      inputHash,
      generatedById: opts.userId,
    });

    return {
      payload,
      insight: {
        id: persisted.id,
        targetType: persisted.targetType,
        targetId: persisted.targetId,
        kind: persisted.kind,
        modelName: persisted.modelName,
        generatedAt: persisted.generatedAt.toISOString(),
        expiresAt: persisted.expiresAt?.toISOString() ?? null,
        cached: false,
        source,
        latencyMs: persisted.latencyMs,
        summary: persisted.summary,
      },
    };
  }

  // ── Opportunity Activity Summary ──────────────────────────────────────────

  async getOppActivitySummary(
    tenantId: string,
    oppId: string,
    opts: { force?: boolean; userId?: string } = {},
  ): Promise<InsightEnvelope<OppActivitySummaryPayload>> {
    const ctx = await this.ctxBuilder.buildActivitySummaryContext(tenantId, oppId);
    const inputHash = this.ctxBuilder.hashContext(ctx);

    if (!opts.force) {
      const cached = await this.findFresh(tenantId, 'opportunity', oppId, AIInsightKind.OPP_ACTIVITY_SUMMARY, inputHash);
      if (cached) return this.envelope<OppActivitySummaryPayload>(cached, true);
    }

    const t0 = Date.now();
    const result = await this.claude.complete<OppActivitySummaryPayload>({
      system: OPP_ACTIVITY_SUMMARY_SYSTEM,
      user: buildOppActivitySummaryUser(ctx),
      prefill: '{',
      maxTokens: 768,
    });

    let payload: OppActivitySummaryPayload;
    let source: 'live' | 'stub' | 'heuristic';
    if (result.source === 'live' && result.json && this.validateOppActivitySummary(result.json)) {
      payload = result.json;
      source = 'live';
    } else {
      payload = heuristicOppActivitySummary(ctx);
      source = result.source === 'live' ? 'heuristic' : 'stub';
    }

    const persisted = await this.persist({
      tenantId,
      targetType: 'opportunity',
      targetId: oppId,
      kind: AIInsightKind.OPP_ACTIVITY_SUMMARY,
      payload,
      summary: payload.summary.slice(0, 200),
      modelName: result.modelName,
      usage: result.usage,
      latencyMs: Date.now() - t0,
      inputHash,
      generatedById: opts.userId,
    });

    return {
      payload,
      insight: {
        id: persisted.id,
        targetType: persisted.targetType,
        targetId: persisted.targetId,
        kind: persisted.kind,
        modelName: persisted.modelName,
        generatedAt: persisted.generatedAt.toISOString(),
        expiresAt: persisted.expiresAt?.toISOString() ?? null,
        cached: false,
        source,
        latencyMs: persisted.latencyMs,
        summary: persisted.summary,
      },
    };
  }

  // ── Lead Score ────────────────────────────────────────────────────────────

  async getLeadScore(
    tenantId: string,
    leadId: string,
    opts: { force?: boolean; userId?: string } = {},
  ): Promise<InsightEnvelope<LeadScorePayload>> {
    const ctx = await this.ctxBuilder.buildLeadContext(tenantId, leadId);
    const inputHash = this.ctxBuilder.hashContext(ctx);

    if (!opts.force) {
      const cached = await this.findFresh(tenantId, 'lead', leadId, AIInsightKind.LEAD_SCORE, inputHash);
      if (cached) return this.envelope<LeadScorePayload>(cached, true);
    }

    const t0 = Date.now();
    const result = await this.claude.complete<LeadScorePayload>({
      system: LEAD_SCORE_SYSTEM,
      user: buildLeadScoreUser(ctx),
      prefill: '{',
      maxTokens: 768,
    });

    let payload: LeadScorePayload;
    let source: 'live' | 'stub' | 'heuristic';
    if (result.source === 'live' && result.json && this.validateLeadScore(result.json)) {
      payload = result.json;
      source = 'live';
    } else {
      payload = heuristicLeadScore(ctx);
      source = result.source === 'live' ? 'heuristic' : 'stub';
    }

    const persisted = await this.persist({
      tenantId,
      targetType: 'lead',
      targetId: leadId,
      kind: AIInsightKind.LEAD_SCORE,
      payload,
      summary: payload.reasoning.slice(0, 200),
      modelName: result.modelName,
      usage: result.usage,
      latencyMs: Date.now() - t0,
      inputHash,
      generatedById: opts.userId,
    });

    // Mirror score + band back to Lead so list-view sorting and Lead.rating
    // (hot/warm/cold) stay in sync without the UI having to read AIInsight.
    try {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { score: payload.score, rating: payload.band },
      });
    } catch (e) {
      // non-fatal — record may have just been deleted
      this.logger.warn(`failed to mirror lead.score for ${leadId}: ${(e as Error).message}`);
    }

    return {
      payload,
      insight: {
        id: persisted.id,
        targetType: persisted.targetType,
        targetId: persisted.targetId,
        kind: persisted.kind,
        modelName: persisted.modelName,
        generatedAt: persisted.generatedAt.toISOString(),
        expiresAt: persisted.expiresAt?.toISOString() ?? null,
        cached: false,
        source,
        latencyMs: persisted.latencyMs,
        summary: persisted.summary,
      },
    };
  }

  // ── Account Briefing ──────────────────────────────────────────────────────

  async getAccountBriefing(
    tenantId: string,
    accountId: string,
    opts: { force?: boolean; userId?: string } = {},
  ): Promise<InsightEnvelope<AccountBriefingPayload>> {
    const ctx = await this.ctxBuilder.buildAccountContext(tenantId, accountId);
    const inputHash = this.ctxBuilder.hashContext(ctx);

    if (!opts.force) {
      const cached = await this.findFresh(tenantId, 'account', accountId, AIInsightKind.ACCOUNT_BRIEFING, inputHash);
      if (cached) return this.envelope<AccountBriefingPayload>(cached, true);
    }

    const t0 = Date.now();
    const result = await this.claude.complete<AccountBriefingPayload>({
      system: ACCOUNT_BRIEFING_SYSTEM,
      user: buildAccountBriefingUser(ctx),
      prefill: '{',
      maxTokens: 1024,
    });

    let payload: AccountBriefingPayload;
    let source: 'live' | 'stub' | 'heuristic';
    if (result.source === 'live' && result.json && this.validateAccountBriefing(result.json)) {
      payload = result.json;
      source = 'live';
    } else {
      payload = heuristicAccountBriefing(ctx);
      source = result.source === 'live' ? 'heuristic' : 'stub';
    }

    const persisted = await this.persist({
      tenantId,
      targetType: 'account',
      targetId: accountId,
      kind: AIInsightKind.ACCOUNT_BRIEFING,
      payload,
      summary: payload.summary.slice(0, 200),
      modelName: result.modelName,
      usage: result.usage,
      latencyMs: Date.now() - t0,
      inputHash,
      generatedById: opts.userId,
    });

    return {
      payload,
      insight: {
        id: persisted.id,
        targetType: persisted.targetType,
        targetId: persisted.targetId,
        kind: persisted.kind,
        modelName: persisted.modelName,
        generatedAt: persisted.generatedAt.toISOString(),
        expiresAt: persisted.expiresAt?.toISOString() ?? null,
        cached: false,
        source,
        latencyMs: persisted.latencyMs,
        summary: persisted.summary,
      },
    };
  }

  // ── Lead Outreach Draft ──────────────────────────────────────────────────
  // Not cached. Each call generates fresh — drafts are inherently per-attempt.
  // Caller passes channel + tone; we read the lead + caller's user record for
  // signature, then call Claude (or heuristic).

  async draftLeadOutreach(
    tenantId: string,
    leadId: string,
    args: { channel: OutreachChannel; tone: OutreachTone },
    userId: string,
  ): Promise<OutreachDraftResult> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
    });
    if (!lead) throw new Error(`Lead ${leadId} not found`);

    const rep = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, title: true },
    });

    const promptArgs = {
      channel: args.channel,
      tone: args.tone,
      lead: {
        fullName: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
        title: lead.title,
        company: lead.company,
        industry: lead.industry,
        rating: lead.rating,
        source: lead.source,
        description: lead.description,
        employeeCount: lead.employeeCount,
      },
      rep: {
        displayName: rep?.displayName ?? '我',
        title: rep?.title ?? null,
      },
    };

    const t0 = Date.now();
    const result = await this.claude.complete<{
      channel: OutreachChannel;
      subject: string;
      body: string;
      reasoning: string;
    }>({
      system: LEAD_OUTREACH_SYSTEM,
      user: buildLeadOutreachUser(promptArgs),
      prefill: '{',
      maxTokens: 1024,
    });

    if (result.source === 'live'
        && result.json
        && typeof result.json.body === 'string'
        && result.json.body.length > 0) {
      return {
        channel: args.channel,
        subject: result.json.subject ?? '',
        body: result.json.body,
        reasoning: result.json.reasoning ?? '',
        modelName: result.modelName,
        source: 'live',
        latencyMs: Date.now() - t0,
      };
    }

    const fallback = heuristicLeadOutreach({
      channel: args.channel,
      tone: args.tone,
      lead: {
        fullName: promptArgs.lead.fullName,
        title: promptArgs.lead.title,
        company: promptArgs.lead.company,
        industry: promptArgs.lead.industry,
      },
      rep: { displayName: promptArgs.rep.displayName },
    });

    return {
      ...fallback,
      modelName: result.modelName,
      source: result.source === 'live' ? 'heuristic' : 'stub',
      latencyMs: Date.now() - t0,
    };
  }

  // ── Telemetry / cost dashboard ────────────────────────────────────────────
  // Aggregates AIInsight rows for the admin view. All scoped by tenant;
  // admins see only their own tenant's spend.

  async getTelemetry(
    tenantId: string,
    opts: { days?: number } = {},
  ): Promise<TelemetrySummary> {
    const days = Math.max(1, Math.min(opts.days ?? 30, 90));
    const since = new Date(Date.now() - days * 86_400_000);

    // Pull only the columns we need; rows can be many, but each is small.
    const rows = await this.prisma.aIInsight.findMany({
      where: { tenantId, generatedAt: { gte: since } },
      select: {
        kind: true,
        modelName: true,
        promptTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
        latencyMs: true,
        generatedAt: true,
      },
    });

    const totals = {
      insights: rows.length,
      promptTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      avgLatencyMs: 0,
      liveCount: 0,
      stubCount: 0,
    };

    const byKind = new Map<string, {
      kind: string;
      count: number;
      promptTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      avgLatencyMs: number;
    }>();

    const byDay = new Map<string, {
      day: string;
      count: number;
      promptTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
    }>();

    let latencySum = 0;
    for (const r of rows) {
      totals.promptTokens     += r.promptTokens;
      totals.outputTokens     += r.outputTokens;
      totals.cacheReadTokens  += r.cacheReadTokens;
      totals.cacheWriteTokens += r.cacheWriteTokens;
      latencySum              += r.latencyMs;
      if (r.modelName.endsWith('-stub')) totals.stubCount += 1;
      else totals.liveCount += 1;

      const k = byKind.get(r.kind) ?? {
        kind: r.kind, count: 0, promptTokens: 0, outputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0, avgLatencyMs: 0,
      };
      k.count += 1;
      k.promptTokens += r.promptTokens;
      k.outputTokens += r.outputTokens;
      k.cacheReadTokens += r.cacheReadTokens;
      k.cacheWriteTokens += r.cacheWriteTokens;
      k.avgLatencyMs += r.latencyMs;
      byKind.set(r.kind, k);

      const day = r.generatedAt.toISOString().slice(0, 10);
      const d = byDay.get(day) ?? { day, count: 0, promptTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
      d.count += 1;
      d.promptTokens += r.promptTokens;
      d.outputTokens += r.outputTokens;
      d.cacheReadTokens += r.cacheReadTokens;
      byDay.set(day, d);
    }

    totals.avgLatencyMs = rows.length > 0 ? Math.round(latencySum / rows.length) : 0;

    // Cache hit rate = cacheReadTokens / (promptTokens + cacheReadTokens)
    const cacheHitRate = totals.promptTokens + totals.cacheReadTokens > 0
      ? totals.cacheReadTokens / (totals.promptTokens + totals.cacheReadTokens)
      : 0;

    // Convert maps + finalize per-kind avg latency
    const kindList = Array.from(byKind.values())
      .map((k) => ({ ...k, avgLatencyMs: k.count > 0 ? Math.round(k.avgLatencyMs / k.count) : 0 }))
      .sort((a, b) => b.count - a.count);

    // Backfill missing days with zero so the chart doesn't have gaps.
    const dayList: TelemetrySummary['byDay'] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const dayKey = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      dayList.push(byDay.get(dayKey) ?? { day: dayKey, count: 0, promptTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
    }

    return {
      totals: { ...totals, cacheHitRate },
      byKind: kindList,
      byDay: dayList,
      since: since.toISOString(),
      windowDays: days,
    };
  }

  // ── Bulk lookup: AI bands by opportunity IDs (no generation) ─────────────
  // Used by list/drawer views (forecast pivot, opp list) to decorate rows
  // with their cached AI score/band without a per-row request.

  async getOpportunityBandsByIds(
    tenantId: string,
    ids: string[],
  ): Promise<Record<string, { score: number; band: 'low' | 'medium' | 'high'; headline: string; topRisk: string | null; topAction: string | null }>> {
    if (ids.length === 0) return {};
    const insights = await this.prisma.aIInsight.findMany({
      where: {
        tenantId,
        targetType: 'opportunity',
        targetId: { in: ids },
        kind: AIInsightKind.OPP_WIN_PROBABILITY,
      },
      select: { targetId: true, payload: true },
    });
    const out: Record<string, ReturnType<typeof toBand>> = {};
    for (const ins of insights) {
      const payload = ins.payload as OppWinProbabilityPayload | null;
      if (!payload) continue;
      out[ins.targetId] = toBand(payload);
    }
    return out;
  }

  // ── Pipeline Risk Board ───────────────────────────────────────────────────
  // Manager-facing view: list open opps ranked by AI win-probability ascending
  // (worst first). Reads cached insights only — does NOT trigger generation.
  // The UI offers a per-row + bulk "analyze" action that hits the refresh
  // endpoints individually.

  async getPipelineRisk(
    tenantId: string,
    opts: { ownerId?: string; stage?: string; limit?: number } = {},
  ) {
    const limit = Math.min(opts.limit ?? 100, 500);

    const opps = await this.prisma.opportunity.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isClosed: false,
        ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
        ...(opts.stage ? { stage: opts.stage } : {}),
      },
      orderBy: { closeDate: 'asc' },
      take: limit,
      include: {
        account: { select: { id: true, name: true } },
        owner: { select: { id: true, displayName: true } },
      },
    });

    if (opps.length === 0) return { items: [], stats: emptyRiskStats() };

    const insights = await this.prisma.aIInsight.findMany({
      where: {
        tenantId,
        targetType: 'opportunity',
        targetId: { in: opps.map((o) => o.id) },
        kind: AIInsightKind.OPP_WIN_PROBABILITY,
      },
    });
    const insightByOppId = new Map(insights.map((i) => [i.targetId, i]));

    const now = new Date();
    const items = opps.map((o) => {
      const insight = insightByOppId.get(o.id);
      const payload = (insight?.payload as OppWinProbabilityPayload | undefined) ?? null;
      return {
        opportunity: {
          id: o.id,
          name: o.name,
          stage: o.stage,
          amount: o.amount != null ? Number(o.amount) : null,
          currencyCode: o.currencyCode,
          closeDate: o.closeDate.toISOString().slice(0, 10),
          daysToClose: Math.round((o.closeDate.getTime() - now.getTime()) / 86_400_000),
          owner: o.owner ? { id: o.owner.id, displayName: o.owner.displayName } : null,
          account: o.account ? { id: o.account.id, name: o.account.name } : null,
          probability: o.probability,
        },
        insight: insight && payload
          ? {
              score: payload.score,
              band: payload.band,
              headline: payload.headline,
              riskFactors: payload.riskFactors,
              nextActions: payload.nextActions,
              generatedAt: insight.generatedAt.toISOString(),
              modelName: insight.modelName,
              cached: true,
              source: insight.modelName.endsWith('-stub') ? 'stub' as const : 'live' as const,
            }
          : null,
      };
    });

    // Sort: analyzed (lowest score first), unanalyzed at end.
    items.sort((a, b) => {
      const aScore = a.insight?.score;
      const bScore = b.insight?.score;
      if (aScore == null && bScore == null) return a.opportunity.daysToClose - b.opportunity.daysToClose;
      if (aScore == null) return 1;
      if (bScore == null) return -1;
      return aScore - bScore;
    });

    const stats = computeRiskStats(items);
    return { items, stats };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async findFresh(
    tenantId: string,
    targetType: string,
    targetId: string,
    kind: AIInsightKind,
    inputHash: string,
  ) {
    const insight = await this.prisma.aIInsight.findUnique({
      where: {
        tenantId_targetType_targetId_kind: { tenantId, targetType, targetId, kind },
      },
    });
    if (!insight) return null;
    if (insight.inputHash !== inputHash) return null;
    if (insight.expiresAt && insight.expiresAt.getTime() < Date.now()) return null;
    return insight;
  }

  private async persist(input: {
    tenantId: string;
    targetType: string;
    targetId: string;
    kind: AIInsightKind;
    payload: unknown;
    summary: string;
    modelName: string;
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
    latencyMs: number;
    inputHash: string;
    generatedById?: string;
  }) {
    const expiresAt = new Date(Date.now() + TTL_MS);
    return this.prisma.aIInsight.upsert({
      where: {
        tenantId_targetType_targetId_kind: {
          tenantId: input.tenantId,
          targetType: input.targetType,
          targetId: input.targetId,
          kind: input.kind,
        },
      },
      update: {
        payload: input.payload as object,
        summary: input.summary,
        modelName: input.modelName,
        promptTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        cacheReadTokens: input.usage.cacheReadTokens,
        cacheWriteTokens: input.usage.cacheWriteTokens,
        latencyMs: input.latencyMs,
        inputHash: input.inputHash,
        generatedAt: new Date(),
        expiresAt,
        generatedById: input.generatedById,
      },
      create: {
        tenantId: input.tenantId,
        targetType: input.targetType,
        targetId: input.targetId,
        kind: input.kind,
        payload: input.payload as object,
        summary: input.summary,
        modelName: input.modelName,
        promptTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        cacheReadTokens: input.usage.cacheReadTokens,
        cacheWriteTokens: input.usage.cacheWriteTokens,
        latencyMs: input.latencyMs,
        inputHash: input.inputHash,
        expiresAt,
        generatedById: input.generatedById,
      },
    });
  }

  private envelope<T>(insight: {
    id: string;
    targetType: string;
    targetId: string;
    kind: AIInsightKind;
    modelName: string;
    generatedAt: Date;
    expiresAt: Date | null;
    latencyMs: number;
    summary: string | null;
    payload: unknown;
  }, cached: boolean): InsightEnvelope<T> {
    const isStub = insight.modelName.endsWith('-stub');
    return {
      payload: insight.payload as T,
      insight: {
        id: insight.id,
        targetType: insight.targetType,
        targetId: insight.targetId,
        kind: insight.kind,
        modelName: insight.modelName,
        generatedAt: insight.generatedAt.toISOString(),
        expiresAt: insight.expiresAt?.toISOString() ?? null,
        cached,
        source: isStub ? 'stub' : 'live',
        latencyMs: insight.latencyMs,
        summary: insight.summary,
      },
    };
  }

  // ── Validators (cheap shape checks, not full Zod) ─────────────────────────

  private validateOppWinProb(x: unknown): x is OppWinProbabilityPayload {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return typeof o.score === 'number'
      && (o.band === 'low' || o.band === 'medium' || o.band === 'high')
      && typeof o.headline === 'string'
      && Array.isArray(o.riskFactors)
      && Array.isArray(o.strengths)
      && Array.isArray(o.nextActions)
      && typeof o.summary === 'string';
  }

  private validateOppActivitySummary(x: unknown): x is OppActivitySummaryPayload {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return typeof o.summary === 'string'
      && (o.sentiment === 'positive' || o.sentiment === 'neutral' || o.sentiment === 'negative')
      && (o.daysSinceLastActivity === null || typeof o.daysSinceLastActivity === 'number')
      && Array.isArray(o.suggestions)
      && typeof o.isStalled === 'boolean';
  }

  private validateLeadScore(x: unknown): x is LeadScorePayload {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return typeof o.score === 'number'
      && (o.band === 'hot' || o.band === 'warm' || o.band === 'cold')
      && typeof o.fitScore === 'number'
      && typeof o.intentScore === 'number'
      && typeof o.reasoning === 'string'
      && Array.isArray(o.qualifiers)
      && Array.isArray(o.blockers)
      && Array.isArray(o.nextActions);
  }

  private validateAccountBriefing(x: unknown): x is AccountBriefingPayload {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return typeof o.summary === 'string'
      && Array.isArray(o.latestSignals)
      && typeof o.openOppsCount === 'number'
      && typeof o.totalOpenAmount === 'number'
      && Array.isArray(o.risks)
      && Array.isArray(o.opportunities);
  }
}
