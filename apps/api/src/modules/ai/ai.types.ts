// ─── Shared types for AI insight payloads ──────────────────────────────────
//
// These shapes are written into AIInsight.payload (JSON) and surfaced to the
// web client. Keep them flat and stable — the frontend renders them directly.
// Ordered roughly from "most likely to be shown by default" to "advanced".

import type { AIInsightKind } from '@prisma/client';

export type { AIInsightKind };

// ── OPP_WIN_PROBABILITY ────────────────────────────────────────────────────
export interface OppWinProbabilityPayload {
  /** 0–100, AI estimate of close-won probability. May differ from stage default. */
  score: number;
  /** "low" | "medium" | "high" — bucketed for UI badges. */
  band: 'low' | 'medium' | 'high';
  /** One-line headline shown at the top of the card. */
  headline: string;
  /** Why this might NOT close. Each item is one short sentence. */
  riskFactors: string[];
  /** Why it MIGHT close. Each item is one short sentence. */
  strengths: string[];
  /** Concrete next-best-actions, ordered by impact. Each item is verb-led, ≤14 words. */
  nextActions: { action: string; reason: string }[];
  /** Multi-line free-text summary, ≤120 words. */
  summary: string;
}

// ── OPP_ACTIVITY_SUMMARY ───────────────────────────────────────────────────
export interface OppActivitySummaryPayload {
  /** ≤80 words "where this deal is right now". */
  summary: string;
  /** "positive" | "neutral" | "negative" — overall trajectory. */
  sentiment: 'positive' | 'neutral' | 'negative';
  /** Days since last meaningful activity (call/meeting/email). null if never. */
  daysSinceLastActivity: number | null;
  /** Concrete suggestions for the rep's next move. */
  suggestions: { action: string; reason: string }[];
  /** Stalled? (no inbound for >14 days, or stage stuck >stage-typical-duration) */
  isStalled: boolean;
}

// ── LEAD_SCORE ─────────────────────────────────────────────────────────────
export interface LeadScorePayload {
  /** 0–100 overall score. Replaces the old static `Lead.score`. */
  score: number;
  /** "hot" | "warm" | "cold" — keep aligned with existing Lead.rating values. */
  band: 'hot' | 'warm' | 'cold';
  /** Sub-scores so UI can show a breakdown. */
  fitScore: number;     // company/industry/size match (0–100)
  intentScore: number;  // engagement signals + recency (0–100)
  /** ≤80 words explaining the score. */
  reasoning: string;
  /** What qualifies this lead. Each ≤14 words. */
  qualifiers: string[];
  /** What's missing or concerning. Each ≤14 words. */
  blockers: string[];
  /** Verb-led recommended next steps. */
  nextActions: { action: string; reason: string }[];
}

// ── ACCOUNT_BRIEFING ───────────────────────────────────────────────────────
export interface AccountBriefingPayload {
  summary: string;
  latestSignals: string[];
  openOppsCount: number;
  totalOpenAmount: number;
  risks: string[];
  opportunities: string[];
}

// ── Discriminated union for type safety on the service surface ─────────────
export type InsightPayloadByKind = {
  OPP_WIN_PROBABILITY: OppWinProbabilityPayload;
  OPP_ACTIVITY_SUMMARY: OppActivitySummaryPayload;
  OPP_NEXT_BEST_ACTION: { actions: { action: string; reason: string }[] };
  LEAD_SCORE: LeadScorePayload;
  LEAD_DRAFT_OUTREACH: { channel: 'email' | 'wechat' | 'phone'; subject: string; body: string };
  ACCOUNT_BRIEFING: AccountBriefingPayload;
};
