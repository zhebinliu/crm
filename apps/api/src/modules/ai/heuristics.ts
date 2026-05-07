// ─── Heuristic fallbacks ────────────────────────────────────────────────────
//
// When ANTHROPIC_API_KEY is missing, we still need to return something useful
// so the UI works in dev/CI. These functions reproduce a lightweight version
// of what the prompts ask Claude to compute, using rules that are explainable.
//
// They are also useful as a baseline for evaluating LLM output quality.

import type {
  OppContextForPrompt,
} from './prompts/opportunity-win-probability.prompt';
import type {
  ActivitySummaryContext,
} from './prompts/opportunity-activity-summary.prompt';
import type {
  LeadContextForPrompt,
} from './prompts/lead-score.prompt';
import type {
  AccountContextForPrompt,
} from './prompts/account-briefing.prompt';
import type {
  OutreachChannel,
  OutreachTone,
} from './prompts/lead-outreach-draft.prompt';
import type {
  OppWinProbabilityPayload,
  OppActivitySummaryPayload,
  LeadScorePayload,
  AccountBriefingPayload,
} from './ai.types';

const STAGE_BASE: Record<string, number> = {
  prospecting: 10,
  qualification: 25,
  needs_analysis: 40,
  value_proposition: 55,
  proposal: 70,
  negotiation: 85,
  closed_won: 100,
  closed_lost: 0,
};

export function heuristicOppWinProbability(ctx: OppContextForPrompt): OppWinProbabilityPayload {
  const opp = ctx.opportunity;
  let score = STAGE_BASE[opp.stage] ?? 20;
  const risks: string[] = [];
  const strengths: string[] = [];

  if (opp.isClosed) {
    score = opp.isWon ? 100 : 0;
  } else {
    // Activity freshness
    if (ctx.daysSinceLastActivity == null) {
      score -= 15;
      risks.push('从未记录任何客户互动');
    } else if (ctx.daysSinceLastActivity > 30) {
      score -= 12;
      risks.push(`已 ${ctx.daysSinceLastActivity} 天未与客户互动`);
    } else if (ctx.daysSinceLastActivity <= 7) {
      score += 6;
      strengths.push('近 7 天内有客户互动');
    }

    // Close date sanity
    if (opp.daysToClose != null) {
      if (opp.daysToClose < 0) {
        score -= 20;
        risks.push(`关闭日期已过 ${-opp.daysToClose} 天`);
      } else if (opp.daysToClose < 14 && score < 70) {
        score -= 10;
        risks.push('临近关闭但仍处早期阶段');
      }
    } else {
      risks.push('未设定关闭日期');
    }

    // Next step
    if (!opp.nextStep || opp.nextStep.trim().length === 0) {
      score -= 5;
      risks.push('未填写下一步行动');
    } else {
      strengths.push('已规划明确的下一步');
    }

    // Primary contact
    if (!ctx.primaryContact) {
      score -= 5;
      risks.push('缺少主要对接联系人');
    } else if (ctx.primaryContact.title && /CEO|CTO|CFO|CIO|VP|总裁|总监|总经理/i.test(ctx.primaryContact.title)) {
      score += 5;
      strengths.push(`已对接到决策层（${ctx.primaryContact.title}）`);
    }

    // Line items
    if (ctx.totalLineItems > 0) {
      strengths.push(`已配置 ${ctx.totalLineItems} 项产品明细`);
    } else if (opp.stage === 'proposal' || opp.stage === 'negotiation') {
      score -= 8;
      risks.push('已进入提案/谈判阶段但无产品明细');
    }

    // Account quality
    if (ctx.account?.type === 'customer' && (opp.type === 'renewal' || opp.type === 'existing_business')) {
      score += 8;
      strengths.push('老客户续约或扩展业务');
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: OppWinProbabilityPayload['band'] = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

  const nextActions: OppWinProbabilityPayload['nextActions'] = [];
  if (!opp.isClosed) {
    if (ctx.daysSinceLastActivity == null || ctx.daysSinceLastActivity > 14) {
      nextActions.push({
        action: '本周内联系一次客户',
        reason: '恢复跟进节奏',
      });
    }
    if (!opp.nextStep) {
      nextActions.push({ action: '补充下一步行动计划', reason: '让团队对齐' });
    }
    if (!ctx.primaryContact) {
      nextActions.push({ action: '确认主要决策联系人', reason: '推进需要决策人参与' });
    }
    if (ctx.totalLineItems === 0 && (opp.stage === 'proposal' || opp.stage === 'negotiation')) {
      nextActions.push({ action: '补充产品明细与报价', reason: '便于客户决策' });
    }
    if (opp.daysToClose != null && opp.daysToClose < 0) {
      nextActions.push({ action: '更新预计关闭日期', reason: '当前日期已过期' });
    }
    if (nextActions.length === 0) {
      nextActions.push({ action: '推进至下一阶段', reason: '当前节奏正常' });
    }
  }

  if (strengths.length === 0 && !opp.isClosed) {
    strengths.push('暂无显著亮点');
  }
  if (risks.length === 0 && !opp.isClosed) {
    risks.push('暂无明显风险');
  }

  const headline = opp.isClosed
    ? (opp.isWon ? '已赢单' : '已丢单')
    : `预估赢单概率 ${score}%（${stageHint(opp.stage)}）`;

  const summary = opp.isClosed
    ? (opp.isWon ? '商机已成功关闭。' : '商机已丢失，建议复盘原因并归档。')
    : `当前阶段：${opp.stageZh}。${ctx.daysSinceLastActivity == null ? '暂无活动记录，' : `最近 ${ctx.daysSinceLastActivity} 天无新活动，`}${opp.nextStep ? '已设定下一步。' : '尚未设定下一步。'}建议优先${nextActions[0]?.action ?? '保持节奏'}。`;

  return {
    score,
    band,
    headline,
    riskFactors: risks,
    strengths,
    nextActions,
    summary,
  };
}

function stageHint(stage: string): string {
  const map: Record<string, string> = {
    prospecting: '初期阶段',
    qualification: '资质核实',
    needs_analysis: '需求分析',
    value_proposition: '价值传递',
    proposal: '提案中',
    negotiation: '商务谈判',
  };
  return map[stage] ?? '推进中';
}

// ── Activity summary heuristic ──────────────────────────────────────────────

export function heuristicOppActivitySummary(ctx: ActivitySummaryContext): OppActivitySummaryPayload {
  const meaningful = ctx.activities.filter(
    (a) => a.completed && (a.type === 'CALL' || a.type === 'MEETING' || a.type === 'EMAIL'),
  );
  const last = meaningful[0];
  const daysSince = last ? last.daysAgo : null;
  const isStalled = daysSince == null || daysSince > 14;

  let sentiment: OppActivitySummaryPayload['sentiment'] = 'neutral';
  if (daysSince != null && daysSince <= 7 && meaningful.length >= 2) sentiment = 'positive';
  if (isStalled) sentiment = 'negative';

  const summary = ctx.activities.length === 0
    ? `${ctx.opportunityName} 暂无活动记录，建议尽快发起首次接触。`
    : isStalled
      ? `${ctx.opportunityName} 已 ${daysSince ?? '长时间'} 天无客户互动，停滞风险较高，需要主动推进。`
      : `${ctx.opportunityName} 近期保持 ${meaningful.length} 次有效互动，节奏正常。`;

  const suggestions: OppActivitySummaryPayload['suggestions'] = [];
  if (isStalled) {
    suggestions.push({ action: '发送跟进邮件', reason: '重启对话' });
    suggestions.push({ action: '安排 15 分钟电话', reason: '了解最新进展' });
  } else {
    suggestions.push({ action: '总结本轮互动要点', reason: '帮助阶段推进' });
  }

  return {
    summary,
    sentiment,
    daysSinceLastActivity: daysSince,
    suggestions,
    isStalled,
  };
}

// ── Lead score heuristic ────────────────────────────────────────────────────

export function heuristicLeadScore(ctx: LeadContextForPrompt): LeadScorePayload {
  const lead = ctx.lead;
  let fit = 30;
  let intent = 30;
  const qualifiers: string[] = [];
  const blockers: string[] = [];

  // Fit dimension
  if (lead.title && /CEO|CTO|CFO|CIO|VP|总裁|总监|总经理|经理|主管|Director|Manager/i.test(lead.title)) {
    fit += 25;
    qualifiers.push(`决策层职级（${lead.title}）`);
  }
  if (lead.industry) {
    fit += 10;
    qualifiers.push(`明确行业：${lead.industry}`);
  }
  if (lead.annualRevenue && lead.annualRevenue > 0) {
    fit += 15;
    qualifiers.push(`公司规模信息完整`);
  } else {
    blockers.push('缺少公司规模信息');
  }
  if (lead.employeeCount && lead.employeeCount >= 50) {
    fit += 10;
  }
  if (!lead.email && !lead.phone) {
    fit -= 20;
    blockers.push('缺少邮箱与电话');
  }

  // Intent dimension
  if (lead.rating === 'hot') intent += 30;
  else if (lead.rating === 'warm') intent += 15;
  else if (lead.rating === 'cold') intent -= 10;

  if (lead.status === 'qualified') intent += 25;
  else if (lead.status === 'working') intent += 10;
  else if (lead.status === 'unqualified') intent -= 30;

  if (lead.source) {
    if (/refer|介绍|inbound/i.test(lead.source)) {
      intent += 15;
      qualifiers.push(`高质量来源：${lead.source}`);
    } else {
      intent += 5;
    }
  } else {
    blockers.push('未记录来源渠道');
  }

  if (ctx.activityCount.last7days > 0) {
    intent += 10;
    qualifiers.push(`近 7 天有 ${ctx.activityCount.last7days} 次互动`);
  } else if (ctx.activityCount.total === 0) {
    intent -= 15;
    blockers.push('暂无互动记录');
  }

  if (lead.description && lead.description.length > 80) {
    intent += 5;
    qualifiers.push('已记录详细背景信息');
  }

  fit = Math.max(0, Math.min(100, Math.round(fit)));
  intent = Math.max(0, Math.min(100, Math.round(intent)));
  const score = Math.round(fit * 0.45 + intent * 0.55);
  const band: LeadScorePayload['band'] = score >= 75 ? 'hot' : score >= 50 ? 'warm' : 'cold';

  const nextActions: LeadScorePayload['nextActions'] = [];
  if (band === 'hot') {
    nextActions.push({ action: '24 小时内电话联系', reason: '热单转化窗口短' });
    nextActions.push({ action: '准备演示与方案', reason: '推进至商机' });
  } else if (band === 'warm') {
    nextActions.push({ action: '安排 30 分钟需求沟通', reason: '判断真实需求' });
    if (ctx.activityCount.last7days === 0) {
      nextActions.push({ action: '发送行业资料', reason: '保持温度' });
    }
  } else {
    nextActions.push({ action: '加入培育序列', reason: '暂未到决策时机' });
  }

  const reasoning = `综合公司适配 ${fit} 分、购买意向 ${intent} 分得到 ${score} 分。${
    qualifiers.length > 0 ? `主要利好：${qualifiers[0]}。` : ''
  }${
    blockers.length > 0 ? `主要短板：${blockers[0]}。` : ''
  }`;

  return {
    score,
    band,
    fitScore: fit,
    intentScore: intent,
    reasoning,
    qualifiers,
    blockers,
    nextActions,
  };
}

// ── Account briefing heuristic ─────────────────────────────────────────────

export function heuristicAccountBriefing(ctx: AccountContextForPrompt): AccountBriefingPayload {
  const { account, openOpps, closedOpps, contacts, daysSinceLastActivity, totalOpenAmount } = ctx;

  const wonCount = closedOpps.filter((o) => o.isWon).length;
  const lostCount = closedOpps.filter((o) => !o.isWon).length;
  const cityFragment = account.billingCity ? `${account.billingCity}的` : '';
  const sizeFragment = account.employeeCount
    ? account.employeeCount >= 1000 ? '大型'
      : account.employeeCount >= 200 ? '中型'
      : '中小型'
    : '';
  const industryFragment = account.industry ? `${account.industry}行业` : '客户';

  const summary = [
    `${cityFragment}${sizeFragment}${industryFragment}`,
    openOpps.length > 0
      ? `当前有 ${openOpps.length} 个进行中商机，合计 ${(totalOpenAmount / 10000).toFixed(1)} 万`
      : '当前无进行中商机',
    wonCount > 0 ? `历史已成交 ${wonCount} 单` : '',
    daysSinceLastActivity == null
      ? '暂无互动记录'
      : daysSinceLastActivity > 30
        ? `已 ${daysSinceLastActivity} 天无互动`
        : `近 ${daysSinceLastActivity} 天有互动`,
  ].filter(Boolean).join('，') + '。';

  const latestSignals: string[] = [];
  if (openOpps.length > 0 && openOpps[0]) {
    const top = openOpps[0];
    latestSignals.push(
      `「${top.name}」${top.stageZh}${top.amount ? `（${(top.amount / 10000).toFixed(1)} 万）` : ''}`,
    );
  }
  if (closedOpps[0]) {
    const c = closedOpps[0];
    latestSignals.push(`最近${c.isWon ? '赢单' : '丢单'}「${c.name}」`);
  }
  if (daysSinceLastActivity != null && daysSinceLastActivity <= 7) {
    latestSignals.push(`近 ${daysSinceLastActivity} 天有客户互动`);
  }

  const risks: string[] = [];
  if (daysSinceLastActivity == null) {
    risks.push('从未记录任何互动');
  } else if (daysSinceLastActivity > 60) {
    risks.push(`已 ${daysSinceLastActivity} 天无客户互动，关系可能转冷`);
  }
  if (contacts.length === 0) {
    risks.push('账号下无联系人记录');
  }
  if (lostCount > 0 && lostCount >= wonCount) {
    risks.push(`历史丢单 ${lostCount} 次，需要谨慎切入`);
  }
  const overdueOpps = openOpps.filter((o) => o.daysToClose != null && o.daysToClose < 0);
  if (overdueOpps.length > 0) {
    risks.push(`${overdueOpps.length} 个商机关闭日期已过期`);
  }

  const opportunities: string[] = [];
  if (account.type === 'customer' && wonCount > 0 && openOpps.length === 0) {
    opportunities.push('老客户当前无活跃商机，可发起续约或扩展沟通');
  }
  if (account.employeeCount && account.employeeCount >= 500 && openOpps.length === 1) {
    opportunities.push('大型客户当前仅 1 个商机，可探索其他业务部门');
  }
  if (contacts.length >= 3 && openOpps.length > 0) {
    opportunities.push(`已对接 ${contacts.length} 位联系人，可推进多决策人共识`);
  }
  if (opportunities.length === 0 && openOpps.length > 0) {
    opportunities.push('优先推进当前商机至下一阶段');
  }

  return {
    summary,
    latestSignals,
    openOppsCount: openOpps.length,
    totalOpenAmount,
    risks,
    opportunities,
  };
}

// ── Lead outreach heuristic ────────────────────────────────────────────────
// Used when ANTHROPIC_API_KEY is missing. Produces a serviceable but generic
// opener so the UI is testable end-to-end without LLM access.

interface OutreachHeuristicArgs {
  channel: OutreachChannel;
  tone: OutreachTone;
  lead: {
    fullName: string;
    title: string | null;
    company: string;
    industry: string | null;
  };
  rep: {
    displayName: string;
  };
}

export function heuristicLeadOutreach(args: OutreachHeuristicArgs): {
  channel: OutreachChannel;
  subject: string;
  body: string;
  reasoning: string;
} {
  const greeting = args.lead.fullName ? `${args.lead.fullName}您好，` : '您好，';
  const role = args.lead.title ? `（${args.lead.title}）` : '';
  const industry = args.lead.industry ? `${args.lead.industry}行业` : '同类企业';

  if (args.channel === 'email') {
    return {
      channel: 'email',
      subject: `关于${args.lead.company}增长的几个想法`,
      body: `${greeting}\n\n我是${args.rep.displayName}。看到您在${args.lead.company}${role}负责相关工作，我们最近帮一些${industry}解决了类似的销售流程提效问题，效果不错。\n\n方便约 30 分钟视频会议聊聊吗？我会带 2-3 个具体案例过来。\n\n如果时间不合适，也可以先发份产品资料给您参考。\n\n顺颂商祺，\n${args.rep.displayName}`,
      reasoning: '基于姓名/职位/公司模板生成，可在 LLM 不可用时使用。',
    };
  }
  if (args.channel === 'wechat') {
    return {
      channel: 'wechat',
      subject: '',
      body: `${greeting}我是${args.rep.displayName}，了解到您在${args.lead.company}${role}。我们最近在${industry}有一些落地案例，方便聊 15 分钟看看是否对您有参考价值吗？`,
      reasoning: '微信场景使用极简口语化模板。',
    };
  }
  // phone
  return {
    channel: 'phone',
    subject: '',
    body: `${greeting}我是${args.rep.displayName}，30 秒打扰一下。\n\n看到您是${args.lead.company}的${args.lead.title ?? '相关负责人'}，我们最近在${industry}帮几家公司解决了销售流程提效的问题。想跟您约 30 分钟，介绍 2-3 个具体案例，您看本周哪天方便？`,
    reasoning: '电话脚本控制在 30 秒以内，开场+价值+CTA。',
  };
}
