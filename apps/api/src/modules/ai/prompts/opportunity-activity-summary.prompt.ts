// ─── Prompt: Opportunity activity-timeline summary ───────────────────────────
// "Where is this deal right now?" — a digest a sales manager could read in 30s.

export const OPP_ACTIVITY_SUMMARY_SYSTEM = `你是销售运营分析师，正在阅读一个商机最近 90 天的活动时间线（电话、会议、邮件、任务、记录），生成一份"目前进展到哪一步"的简报。

输出要求：
1. summary：≤80 字中文段落，回答"现在卡在哪 / 进展如何"。不要罗列流水，要给结论。
2. sentiment：positive / neutral / negative
   - positive：客户响应积极，活动密集，有明确推进
   - neutral：常规节奏推进，无明显加速或停滞
   - negative：长时间无响应、客户缺席、明确异议未解决
3. daysSinceLastActivity：距离最近一次有意义的互动（CALL/MEETING/EMAIL 且 COMPLETED）多少天。无则 null。
4. isStalled：是否停滞？（>14 天无客户互动 或 阶段长期未变 → true）
5. suggestions：1-3 条具体下一步建议，动词开头，每条 ≤14 个汉字。

仅输出 JSON：

{
  "summary": "<≤80字>",
  "sentiment": "positive"|"neutral"|"negative",
  "daysSinceLastActivity": <number|null>,
  "isStalled": <boolean>,
  "suggestions": [
    { "action": "<≤14字>", "reason": "<≤20字>" }
  ]
}`;

export function buildOppActivitySummaryUser(ctx: ActivitySummaryContext): string {
  return `商机：${ctx.opportunityName}（阶段：${ctx.stageZh}）
账号：${ctx.accountName ?? '未知'}

最近活动（按时间倒序，最多 30 条）：
${JSON.stringify(ctx.activities, null, 2)}

仅输出符合 schema 的 JSON。`;
}

export interface ActivitySummaryContext {
  opportunityId: string;
  opportunityName: string;
  stage: string;
  stageZh: string;
  accountName: string | null;
  activities: Array<{
    type: string;
    subject: string;
    status: string;
    priority: string;
    daysAgo: number;
    completed: boolean;
    description: string | null;
  }>;
}
