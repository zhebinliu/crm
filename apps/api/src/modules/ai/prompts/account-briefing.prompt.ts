// ─── Prompt: Account briefing ──────────────────────────────────────────────
// "Give me a 30-second briefing on this account before I walk into the meeting."

export const ACCOUNT_BRIEFING_SYSTEM = `你是销售运营分析师，正在为一位即将和某客户会面的销售代表准备一份 60 秒可读完的 briefing。

briefing 必须能让销售在会面前快速回答以下问题：
1. 这家客户当前和我们的合作处在什么阶段？
2. 当前有哪些活跃的业务机会？金额规模？
3. 最近发生了什么变化（新机会、阶段推进、流失风险）？
4. 有哪些值得警惕的风险信号？
5. 我们有什么独特的拓展机会？

输出格式：

{
  "summary": "<≤120字 中文段落，整体合作概况>",
  "latestSignals": ["<最近的关键信号，每条≤25字>", ...],   // 1-4 条，按时间倒序
  "openOppsCount": <number>,                              // 当前未关闭商机数
  "totalOpenAmount": <number>,                            // 当前未关闭商机金额合计
  "risks": ["<风险点，每条≤25字>", ...],                  // 0-3 条
  "opportunities": ["<拓展机会，每条≤25字>", ...]          // 0-3 条
}

要点：
- 不要罗列流水账。要给结论和判断。
- 风险要具体（"主要联系人 3 个月未互动" 而不是 "缺少互动"）。
- 拓展机会要可执行（"上下游产品交叉销售" 而不是 "可以拓展"）。`;

export function buildAccountBriefingUser(ctx: AccountContextForPrompt): string {
  return `请为以下客户准备 briefing：

${JSON.stringify(ctx, null, 2)}

仅输出符合 schema 的 JSON。`;
}

export interface AccountContextForPrompt {
  account: {
    id: string;
    name: string;
    type: string | null;
    industry: string | null;
    annualRevenue: number | null;
    employeeCount: number | null;
    rating: string | null;
    billingCity: string | null;
    description: string | null;
    daysSinceCreated: number;
  };
  contacts: Array<{
    fullName: string;
    title: string | null;
    department: string | null;
    isPrimary: boolean;
  }>;
  openOpps: Array<{
    name: string;
    stage: string;
    stageZh: string;
    amount: number | null;
    closeDate: string | null;
    daysToClose: number | null;
  }>;
  closedOpps: Array<{
    name: string;
    isWon: boolean;
    amount: number | null;
    closedAt: string | null;
  }>;
  recentActivities: Array<{
    type: string;
    subject: string;
    daysAgo: number;
    completed: boolean;
  }>;
  daysSinceLastActivity: number | null;
  totalOpenAmount: number;
}
