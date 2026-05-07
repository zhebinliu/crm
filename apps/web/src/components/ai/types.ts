// Mirrors apps/api/src/modules/ai/ai.types.ts. Keep in sync.

export interface InsightMeta {
  id: string;
  targetType: string;
  targetId: string;
  kind: string;
  modelName: string;
  generatedAt: string;
  expiresAt: string | null;
  cached: boolean;
  source: 'live' | 'stub' | 'heuristic';
  latencyMs: number;
  summary: string | null;
}

export interface InsightEnvelope<T> {
  payload: T;
  insight: InsightMeta;
}

export interface NextAction {
  action: string;
  reason: string;
}

export interface OppWinProbabilityPayload {
  score: number;
  band: 'low' | 'medium' | 'high';
  headline: string;
  riskFactors: string[];
  strengths: string[];
  nextActions: NextAction[];
  summary: string;
}

export interface OppActivitySummaryPayload {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  daysSinceLastActivity: number | null;
  suggestions: NextAction[];
  isStalled: boolean;
}

export interface LeadScorePayload {
  score: number;
  band: 'hot' | 'warm' | 'cold';
  fitScore: number;
  intentScore: number;
  reasoning: string;
  qualifiers: string[];
  blockers: string[];
  nextActions: NextAction[];
}

export interface AccountBriefingPayload {
  summary: string;
  latestSignals: string[];
  openOppsCount: number;
  totalOpenAmount: number;
  risks: string[];
  opportunities: string[];
}

export interface LeadOutreachDraftPayload {
  channel: 'email' | 'wechat' | 'phone';
  subject: string;
  body: string;
  reasoning?: string;
}
