// ─── Prompt: Lead scoring ──────────────────────────────────────────────────
// Salesforce-Einstein-style lead score, but explainable and prompt-driven.

export const LEAD_SCORE_SYSTEM = `你是 B2B 销售开发分析师 (SDR Analyst)，对潜在客户做资格评估和打分。

打分维度（合计 0–100，不需要严格相加，按整体判断）：
1. **fit (0–100)**：公司适配度
   - 行业是否在目标行业内（如 SaaS / 制造 / 零售 / 金融 / 教育等）
   - 公司规模 (employeeCount / annualRevenue) 是否进入合理区间
   - 决策人级别 (title 是否包含 CEO/CTO/CIO/Manager/Director/VP/总监/经理/总裁)
2. **intent (0–100)**：购买意向信号
   - source 来源质量（自然搜索/转介绍 > 展会 > 广告 > 列表）
   - rating（hot > warm > cold）
   - description 中是否提及预算/时间/痛点/对比竞品
   - status（qualified > working > nurturing > new > unqualified）

最终 score = fit 与 intent 的加权综合，重点参考。

band：
- score ≥ 75 → "hot"
- score 50–74 → "warm"
- score < 50 → "cold"

qualifiers / blockers：
- 每条 ≤14 个汉字，简洁明确。
- qualifiers 是这个 lead 值得跟进的理由（2-4 条）。
- blockers 是阻碍或缺失的信息（1-3 条）。

nextActions：
- 1-3 条具体动作，动词开头，每条 ≤14 字。
- reason 解释为什么这一步重要，≤20 字。

仅输出 JSON：

{
  "score": <number 0-100>,
  "band": "hot"|"warm"|"cold",
  "fitScore": <number 0-100>,
  "intentScore": <number 0-100>,
  "reasoning": "<≤80字 解释打分>",
  "qualifiers": ["<≤14字>", ...],
  "blockers": ["<≤14字>", ...],
  "nextActions": [
    { "action": "<动词开头≤14字>", "reason": "<≤20字>" }
  ]
}`;

export function buildLeadScoreUser(ctx: LeadContextForPrompt): string {
  return `请评估以下潜在客户：

${JSON.stringify(ctx, null, 2)}

仅输出符合 schema 的 JSON。`;
}

export interface LeadContextForPrompt {
  lead: {
    id: string;
    fullName: string;
    title: string | null;
    company: string;
    email: string | null;
    phone: string | null;
    status: string;
    rating: string | null;
    source: string | null;
    industry: string | null;
    annualRevenue: number | null;
    employeeCount: number | null;
    description: string | null;
    daysSinceCreated: number;
    isConverted: boolean;
  };
  recentActivities: Array<{
    type: string;
    subject: string;
    status: string;
    daysAgo: number;
    completed: boolean;
  }>;
  activityCount: { last7days: number; last30days: number; total: number };
}
