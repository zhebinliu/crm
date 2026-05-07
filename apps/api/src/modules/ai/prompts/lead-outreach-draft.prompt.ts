// ─── Prompt: First-touch outreach drafting for a Lead ─────────────────────
//
// Generates a personalized opener that the SDR can copy/edit/send.
// Channel matters: email gets subject + body; wechat is shorter informal IM
// style; phone produces a 30-second talking script.

export type OutreachChannel = 'email' | 'wechat' | 'phone';
export type OutreachTone = 'professional' | 'friendly' | 'concise';

export const LEAD_OUTREACH_SYSTEM = `你是一位资深 SDR (Sales Development Representative)，正在为新潜在客户起草第一次外联消息。

约束：
1. **不要假设没说的事** — 不要编造未在 lead context 中出现的信息（如假装"我们之前在某展会见过"，除非 lead.source 明确显示）。
2. **个性化** — 用 lead 的姓名、职位、公司、行业字段。如果 description 中有具体痛点，引用它。
3. **简短** — 邮件正文 ≤150 字，微信 ≤80 字，电话脚本 ≤120 字（30 秒内念完）。
4. **明确 CTA** — 每条消息必须有一个清晰的下一步动作（约 30 分钟电话 / 发资料 / 演示 / 加微信）。
5. **避免销售腔** — 用对方语言风格（B2B SaaS 专业；零售/制造业更直白）。

不同渠道的输出：

email:
- subject：≤25 字，写出对方收件箱里看到时为什么会想点开
- body：开头一句锚定为什么联系（"看到您是 X 公司 Y 职位"），中间一句价值主张，结尾 CTA

wechat / phone:
- subject 留空字符串
- body 即为消息全文（微信第一条）或电话开场+核心价值+CTA

仅输出 JSON：

{
  "channel": "<请求的渠道>",
  "subject": "<标题，仅 email 有；其他场景设为空字符串>",
  "body": "<消息正文>",
  "reasoning": "<≤40字 中文，为什么这样写（不会展示给客户，仅作 SDR 参考）>"
}`;

export function buildLeadOutreachUser(args: {
  channel: OutreachChannel;
  tone: OutreachTone;
  lead: {
    fullName: string;
    title: string | null;
    company: string;
    industry: string | null;
    rating: string | null;
    source: string | null;
    description: string | null;
    employeeCount: number | null;
  };
  rep: {
    displayName: string;
    title: string | null;
  };
}): string {
  return `请为下面这位 lead 起草 ${channelLabel(args.channel)} 外联消息。

风格：${toneLabel(args.tone)}

Lead 信息：
${JSON.stringify(args.lead, null, 2)}

发件人 (我自己) 信息：
${JSON.stringify(args.rep, null, 2)}

仅输出符合 schema 的 JSON。`;
}

function channelLabel(c: OutreachChannel) {
  return c === 'email' ? '邮件' : c === 'wechat' ? '微信' : '电话';
}
function toneLabel(t: OutreachTone) {
  return t === 'professional' ? '正式专业' : t === 'friendly' ? '亲切友好' : '极简直接';
}
