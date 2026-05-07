// ─── Prompt: Opportunity win-probability ──────────────────────────────────
// System: stable rules + JSON schema. Long enough that prompt caching is worth it.
// User:   the per-opportunity context, never cached.

export const OPP_WIN_PROBABILITY_SYSTEM = `你是一位资深销售运营分析师，正在为一家 B2B 公司评估销售机会的赢单概率。

你的任务：基于结构化的商机数据，输出一个赢单概率评分 (0–100)、关键风险、关键利好、以及销售代表下一步应该做的具体动作。

评分标准（参考 Salesforce Einstein 商机评分）：
1. **阶段进度**：所处阶段越靠后基础概率越高（prospecting 10% / qualification 25% / needs_analysis 40% / value_proposition 55% / proposal 70% / negotiation 85% / closed_won 100%）。
2. **活动新鲜度**：14 天内有过有效互动 (CALL/MEETING/EMAIL with COMPLETED 状态) 加分；超过 30 天无活动减分。
3. **关闭日期合理性**：closeDate 已过期且未关闭 → 严重减分；closeDate 距今 <14 天但仍处早期阶段 → 减分。
4. **金额匹配**：amount 缺失或异常（>10x 或 <0.1x 同账号已成交单均值，如可推断）→ 风险加权。
5. **关键人**：primaryContactId 缺失 → 减分；账号无对接联系人 → 减分。
6. **下一步**：nextStep 字段为空 → 减分；存在明确的 nextStep → 加分。
7. **行业/账号信号**：账号若为 customer 类型且有续约/扩展业务（type=existing_business/renewal）→ 加分。

行动建议（nextActions）：
- 必须是动词开头的祈使句，每条 ≤14 个汉字。
- 至少 2 条，最多 4 条。
- 优先级从高到低排列。
- 每条附 reason 解释为什么这一步重要（≤20 字）。

输出严格遵循以下 JSON Schema（不要输出任何 JSON 之外的文本）：

{
  "score": <number 0-100>,
  "band": "low" | "medium" | "high",   // <40 = low, 40-69 = medium, ≥70 = high
  "headline": "<≤25字 中文一句话总结>",
  "riskFactors": ["<≤25字风险点>", ...],     // 1-4 条
  "strengths":   ["<≤25字利好点>", ...],     // 1-4 条
  "nextActions": [
    { "action": "<动词开头的祈使句>", "reason": "<≤20字>" },
    ...
  ],
  "summary": "<≤120字 中文段落，写给销售经理看>"
}`;

export function buildOppWinProbabilityUser(ctx: OppContextForPrompt): string {
  return `请评估以下商机：

${JSON.stringify(ctx, null, 2)}

仅输出符合 schema 的 JSON。`;
}

export interface OppContextForPrompt {
  opportunity: {
    id: string;
    name: string;
    stage: string;
    stageZh: string;
    amount: number | null;
    currencyCode: string;
    closeDate: string | null;
    daysToClose: number | null;
    probability: number;
    forecastCategory: string;
    type: string | null;
    leadSource: string | null;
    nextStep: string | null;
    description: string | null;
    isClosed: boolean;
    isWon: boolean;
    createdAt: string;
    daysSinceCreated: number;
  };
  account: {
    name: string;
    industry: string | null;
    type: string | null;
    annualRevenue: number | null;
    employeeCount: number | null;
  } | null;
  primaryContact: {
    fullName: string;
    title: string | null;
    department: string | null;
    email: string | null;
  } | null;
  lineItems: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
  }>;
  totalLineItems: number;
  totalLineItemAmount: number;
  recentActivities: Array<{
    type: string;
    subject: string;
    status: string;
    daysAgo: number;
    completed: boolean;
  }>;
  activityCount: {
    last7days: number;
    last30days: number;
    last90days: number;
    total: number;
  };
  daysSinceLastActivity: number | null;
}
