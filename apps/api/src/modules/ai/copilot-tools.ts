// ─── Copilot tool catalog ──────────────────────────────────────────────────
//
// Each tool exposed to the LLM has:
//   • A `def` — the JSON-schema declaration the model sees.
//   • A `handler` — server-side function that runs the actual query and
//     returns a JSON-serializable result. Handlers receive a CopilotContext
//     so they can scope to the calling tenant + user.
//
// Keep tool inputs SMALL and explicit — the model performs better with a
// short, well-typed surface than a do-everything tool.

import type { PrismaService } from '../../prisma/prisma.service';
import type { AiService } from './ai.service';

export interface CopilotContext {
  tenantId: string;
  userId: string;
  prisma: PrismaService;
  ai: AiService;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: Record<string, unknown>, ctx: CopilotContext) => Promise<unknown>;
}

const STAGE_ZH: Record<string, string> = {
  prospecting: '初步接触',
  qualification: '潜在资质',
  needs_analysis: '方案需求',
  value_proposition: '价值主张',
  proposal: '正式提案',
  negotiation: '商务谈判',
  closed_won: '已赢单',
  closed_lost: '已丢单',
};

// ── Tool: search_opportunities ─────────────────────────────────────────────

const searchOpportunities: ToolDefinition = {
  name: 'search_opportunities',
  description: '搜索商机。可按阶段、负责人、是否已关闭、关键词过滤。返回最多 20 条。' +
    '当用户问"我的管道"、"哪些 deal"、"销售机会"时使用。',
  input_schema: {
    type: 'object',
    properties: {
      search:    { type: 'string', description: '在商机名称中模糊搜索。' },
      stage:     { type: 'string', enum: Object.keys(STAGE_ZH), description: '阶段过滤。' },
      isClosed:  { type: 'boolean', description: '是否已关闭。null/省略表示不过滤。' },
      mineOnly:  { type: 'boolean', description: '是否仅查询当前用户负责的商机。' },
      limit:     { type: 'number', description: '返回上限，默认 10，最大 20。' },
    },
  },
  handler: async (input, ctx) => {
    const limit = Math.min(Number(input.limit ?? 10), 20);
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      deletedAt: null,
    };
    if (input.stage) where.stage = input.stage;
    if (input.isClosed != null) where.isClosed = input.isClosed;
    if (input.mineOnly) where.ownerId = ctx.userId;
    if (input.search) where.name = { contains: String(input.search), mode: 'insensitive' };

    const opps = await ctx.prisma.opportunity.findMany({
      where,
      orderBy: { closeDate: 'asc' },
      take: limit,
      include: {
        account: { select: { name: true } },
        owner: { select: { displayName: true } },
      },
    });

    return {
      count: opps.length,
      items: opps.map((o) => ({
        id: o.id,
        name: o.name,
        stage: o.stage,
        stageZh: STAGE_ZH[o.stage] ?? o.stage,
        amount: o.amount != null ? Number(o.amount) : null,
        closeDate: o.closeDate.toISOString().slice(0, 10),
        probability: o.probability,
        isClosed: o.isClosed,
        isWon: o.isWon,
        accountName: o.account?.name ?? null,
        ownerName: o.owner?.displayName ?? null,
      })),
    };
  },
};

// ── Tool: search_leads ─────────────────────────────────────────────────────

const searchLeads: ToolDefinition = {
  name: 'search_leads',
  description: '搜索潜在客户 (lead)。可按状态、评级、负责人过滤。返回最多 20 条。' +
    '当用户问"线索"、"待跟进的客户"时使用。',
  input_schema: {
    type: 'object',
    properties: {
      search:   { type: 'string', description: '在姓名/公司中模糊搜索。' },
      status:   { type: 'string', enum: ['new', 'working', 'nurturing', 'qualified', 'unqualified'] },
      rating:   { type: 'string', enum: ['hot', 'warm', 'cold'] },
      mineOnly: { type: 'boolean', description: '仅查询当前用户负责的线索。' },
      limit:    { type: 'number', description: '返回上限，默认 10，最大 20。' },
    },
  },
  handler: async (input, ctx) => {
    const limit = Math.min(Number(input.limit ?? 10), 20);
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      deletedAt: null,
    };
    if (input.status) where.status = input.status;
    if (input.rating) where.rating = input.rating;
    if (input.mineOnly) where.ownerId = ctx.userId;
    if (input.search) {
      where.OR = [
        { lastName:  { contains: String(input.search), mode: 'insensitive' } },
        { firstName: { contains: String(input.search), mode: 'insensitive' } },
        { company:   { contains: String(input.search), mode: 'insensitive' } },
      ];
    }

    const leads = await ctx.prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      count: leads.length,
      items: leads.map((l) => ({
        id: l.id,
        fullName: [l.firstName, l.lastName].filter(Boolean).join(' '),
        company: l.company,
        title: l.title,
        status: l.status,
        rating: l.rating,
        score: l.score,
        source: l.source,
        email: l.email,
        phone: l.phone,
        isConverted: l.isConverted,
      })),
    };
  },
};

// ── Tool: search_accounts ──────────────────────────────────────────────────

const searchAccounts: ToolDefinition = {
  name: 'search_accounts',
  description: '搜索客户/账号 (account)。当用户问"某某公司"、"客户"时使用。返回最多 20 条。',
  input_schema: {
    type: 'object',
    properties: {
      search:   { type: 'string', description: '在客户名称中模糊搜索。' },
      type:     { type: 'string', description: '客户类型。常见：customer / prospect / partner / competitor。' },
      mineOnly: { type: 'boolean', description: '仅当前用户负责的客户。' },
      limit:    { type: 'number', description: '返回上限，默认 10，最大 20。' },
    },
  },
  handler: async (input, ctx) => {
    const limit = Math.min(Number(input.limit ?? 10), 20);
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      deletedAt: null,
    };
    if (input.type) where.type = input.type;
    if (input.mineOnly) where.ownerId = ctx.userId;
    if (input.search) where.name = { contains: String(input.search), mode: 'insensitive' };

    const accounts = await ctx.prisma.account.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { _count: { select: { opportunities: { where: { isClosed: false, deletedAt: null } } } } },
    });

    return {
      count: accounts.length,
      items: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        industry: a.industry,
        annualRevenue: a.annualRevenue != null ? Number(a.annualRevenue) : null,
        employeeCount: a.employeeCount,
        billingCity: a.billingCity,
        openOppsCount: a._count.opportunities,
      })),
    };
  },
};

// ── Tool: analyze_opportunity ──────────────────────────────────────────────

const analyzeOpportunity: ToolDefinition = {
  name: 'analyze_opportunity',
  description: '对单个商机生成（或读取缓存的） AI 赢单概率分析，包括 0-100 分、风险点、利好、下一步行动建议。' +
    '当用户问"X 商机怎么样"、"这单能赢吗"、"风险点"时使用。',
  input_schema: {
    type: 'object',
    properties: {
      opportunityId: { type: 'string', description: '商机 ID。' },
    },
    required: ['opportunityId'],
  },
  handler: async (input, ctx) => {
    const result = await ctx.ai.getOppWinProbability(
      ctx.tenantId,
      String(input.opportunityId),
      { userId: ctx.userId },
    );
    return {
      score: result.payload.score,
      band: result.payload.band,
      headline: result.payload.headline,
      summary: result.payload.summary,
      riskFactors: result.payload.riskFactors,
      strengths: result.payload.strengths,
      nextActions: result.payload.nextActions,
      modelName: result.insight.modelName,
      cached: result.insight.cached,
    };
  },
};

// ── Tool: get_account_briefing ─────────────────────────────────────────────

const getAccountBriefing: ToolDefinition = {
  name: 'get_account_briefing',
  description: '获取某客户/账号的 60 秒 briefing：当前合作概况、活跃商机、风险信号、拓展机会。' +
    '当用户问"X 客户怎么样"、"准备见 X"、"X 的情况"时使用。',
  input_schema: {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: '客户/账号 ID。' },
    },
    required: ['accountId'],
  },
  handler: async (input, ctx) => {
    const result = await ctx.ai.getAccountBriefing(
      ctx.tenantId,
      String(input.accountId),
      { userId: ctx.userId },
    );
    return {
      summary: result.payload.summary,
      latestSignals: result.payload.latestSignals,
      openOppsCount: result.payload.openOppsCount,
      totalOpenAmount: result.payload.totalOpenAmount,
      risks: result.payload.risks,
      opportunities: result.payload.opportunities,
      cached: result.insight.cached,
    };
  },
};

// ── Tool: get_pipeline_risk_overview ───────────────────────────────────────

const getPipelineRiskOverview: ToolDefinition = {
  name: 'get_pipeline_risk_overview',
  description: '查看整个销售管道的 AI 风险概览：高/中/低风险商机数、在险金额、TOP N 高风险商机列表。' +
    '当用户问"哪些 deal 有风险"、"管道怎么样"、"本周需要重点关注什么"时使用。',
  input_schema: {
    type: 'object',
    properties: {
      mineOnly: { type: 'boolean', description: '仅看当前用户负责的商机。' },
      topN:     { type: 'number', description: '返回风险最高的 N 个商机详情，默认 5。' },
    },
  },
  handler: async (input, ctx) => {
    const result = await ctx.ai.getPipelineRisk(ctx.tenantId, {
      ownerId: input.mineOnly ? ctx.userId : undefined,
      limit: 200,
    });
    const topN = Math.min(Number(input.topN ?? 5), 20);
    const topRisky = result.items
      .filter((it) => it.insight && it.insight.band === 'low')
      .slice(0, topN)
      .map((it) => ({
        id: it.opportunity.id,
        name: it.opportunity.name,
        stage: STAGE_ZH[it.opportunity.stage] ?? it.opportunity.stage,
        amount: it.opportunity.amount,
        closeDate: it.opportunity.closeDate,
        ownerName: it.opportunity.owner?.displayName ?? null,
        score: it.insight!.score,
        topRisk: it.insight!.riskFactors[0] ?? null,
        topAction: it.insight!.nextActions[0]?.action ?? null,
      }));

    return {
      stats: result.stats,
      topRisky,
      hint: result.stats.unanalyzed > 0
        ? `还有 ${result.stats.unanalyzed} 个商机未分析，无法计入风险评估。`
        : null,
    };
  },
};

// ── Tool: count_my_pipeline ────────────────────────────────────────────────

const countMyPipeline: ToolDefinition = {
  name: 'count_my_pipeline',
  description: '按阶段聚合统计当前用户的进行中商机：每个阶段的数量和金额合计。' +
    '当用户问"我的管道分布"、"我有多少 deal"时使用。',
  input_schema: {
    type: 'object',
    properties: {
      mineOnly: { type: 'boolean', description: '是否仅当前用户的商机，默认 true。' },
    },
  },
  handler: async (input, ctx) => {
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      isClosed: false,
    };
    if (input.mineOnly !== false) where.ownerId = ctx.userId;

    const opps = await ctx.prisma.opportunity.findMany({
      where,
      select: { stage: true, amount: true },
    });

    const buckets = new Map<string, { count: number; amount: number }>();
    for (const o of opps) {
      const cur = buckets.get(o.stage) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += o.amount != null ? Number(o.amount) : 0;
      buckets.set(o.stage, cur);
    }

    return {
      total: opps.length,
      totalAmount: opps.reduce((s, o) => s + (o.amount != null ? Number(o.amount) : 0), 0),
      byStage: Array.from(buckets.entries()).map(([stage, v]) => ({
        stage,
        stageZh: STAGE_ZH[stage] ?? stage,
        count: v.count,
        amount: v.amount,
      })),
    };
  },
};

// ── Tool: list_stalled_opportunities ──────────────────────────────────────

const listStalledOpportunities: ToolDefinition = {
  name: 'list_stalled_opportunities',
  description: '列出停滞的商机（>14 天无客户活动 或 关闭日期已过期且未关闭）。' +
    '当用户问"哪些单卡住了"、"长时间没动的商机"时使用。',
  input_schema: {
    type: 'object',
    properties: {
      mineOnly:  { type: 'boolean', description: '是否仅当前用户的商机。' },
      thresholdDays: { type: 'number', description: '多久无活动算停滞，默认 14 天。' },
      limit:     { type: 'number', description: '返回上限，默认 10。' },
    },
  },
  handler: async (input, ctx) => {
    const thresholdDays = Number(input.thresholdDays ?? 14);
    const limit = Math.min(Number(input.limit ?? 10), 20);
    const cutoff = new Date(Date.now() - thresholdDays * 86_400_000);

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      isClosed: false,
    };
    if (input.mineOnly) where.ownerId = ctx.userId;

    const opps = await ctx.prisma.opportunity.findMany({
      where,
      include: { account: { select: { name: true } } },
      take: 100,
      orderBy: { closeDate: 'asc' },
    });

    const oppIds = opps.map((o) => o.id);
    const recentActivities = await ctx.prisma.activity.findMany({
      where: {
        tenantId: ctx.tenantId,
        targetType: 'opportunity',
        targetId: { in: oppIds },
        createdAt: { gte: cutoff },
        deletedAt: null,
      },
      select: { targetId: true },
    });
    const activeIds = new Set(recentActivities.map((a) => a.targetId));

    const now = Date.now();
    const stalled = opps
      .map((o) => ({
        id: o.id,
        name: o.name,
        stage: STAGE_ZH[o.stage] ?? o.stage,
        amount: o.amount != null ? Number(o.amount) : null,
        accountName: o.account?.name ?? null,
        closeDate: o.closeDate.toISOString().slice(0, 10),
        daysToClose: Math.round((o.closeDate.getTime() - now) / 86_400_000),
        hasRecentActivity: activeIds.has(o.id),
        isOverdue: o.closeDate.getTime() < now,
      }))
      .filter((o) => !o.hasRecentActivity || o.isOverdue)
      .slice(0, limit);

    return {
      thresholdDays,
      count: stalled.length,
      items: stalled,
    };
  },
};

export const COPILOT_TOOLS: ToolDefinition[] = [
  searchOpportunities,
  searchLeads,
  searchAccounts,
  analyzeOpportunity,
  getAccountBriefing,
  getPipelineRiskOverview,
  countMyPipeline,
  listStalledOpportunities,
];

export const COPILOT_TOOL_BY_NAME: Map<string, ToolDefinition> = new Map(
  COPILOT_TOOLS.map((t) => [t.name, t]),
);
