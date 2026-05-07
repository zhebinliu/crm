// ─── AI Anomaly Detection background scan ─────────────────────────────────
//
// Once a day, walk every open opportunity in every tenant and ensure its
// OPP_WIN_PROBABILITY insight is fresh. Without an LLM key the scan still
// runs (heuristic path) — that's actually useful: every open opp gets a
// score that the dashboard banner and pipeline-risk board can surface.
//
// The scan is rate-limited (concurrency 2) and skips opps whose cached
// insight is still warm (inputHash + expiresAt match), so daily passes are
// cheap when nothing has changed.

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai.service';

const CONCURRENCY = 2;
const MAX_OPPS_PER_TENANT = 500; // safety cap

@Injectable()
export class AiAnomalyService {
  private readonly log = new Logger(AiAnomalyService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Daily at 02:30 server time. Tunable via env: AI_ANOMALY_CRON.
   * Empty/false-y env disables the scheduled run (manual /trigger only).
   */
  @Cron(process.env.AI_ANOMALY_CRON ?? '30 2 * * *')
  async scheduledScan(): Promise<void> {
    if (process.env.AI_ANOMALY_DISABLED === 'true') return;
    await this.scanAll();
  }

  /** Public entry point so an admin endpoint can trigger a manual run. */
  async scanAll(): Promise<{ tenants: number; oppsAnalyzed: number; durationMs: number }> {
    if (this.running) {
      this.log.warn('Anomaly scan already in progress, skipping overlap');
      return { tenants: 0, oppsAnalyzed: 0, durationMs: 0 };
    }
    this.running = true;
    const t0 = Date.now();
    let tenants = 0;
    let oppsAnalyzed = 0;
    try {
      const tenantList = await this.prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, slug: true },
      });
      for (const t of tenantList) {
        tenants += 1;
        try {
          const n = await this.scanTenant(t.id);
          oppsAnalyzed += n;
          this.log.log(`tenant ${t.slug}: analyzed ${n} opps`);
        } catch (e) {
          this.log.error(`tenant ${t.slug} scan failed: ${(e as Error).message}`);
        }
      }
      this.log.log(`Anomaly scan complete: ${tenants} tenants, ${oppsAnalyzed} opps, ${Date.now() - t0}ms`);
      return { tenants, oppsAnalyzed, durationMs: Date.now() - t0 };
    } finally {
      this.running = false;
    }
  }

  private async scanTenant(tenantId: string): Promise<number> {
    const opps = await this.prisma.opportunity.findMany({
      where: { tenantId, deletedAt: null, isClosed: false },
      select: { id: true },
      take: MAX_OPPS_PER_TENANT,
    });

    if (opps.length === 0) return 0;

    let count = 0;
    const queue = opps.map((o) => o.id);
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) return;
        try {
          // getOppWinProbability hits cache when warm; only writes when stale.
          await this.ai.getOppWinProbability(tenantId, id, {});
          count += 1;
        } catch (e) {
          this.log.warn(`opp ${id} scan failed: ${(e as Error).message}`);
        }
      }
    });
    await Promise.all(workers);
    return count;
  }

  // ── Anomaly summary for dashboard ─────────────────────────────────────────
  // Counts high-risk + at-risk-amount + new high-risk since N hours ago.

  async getDashboardSummary(tenantId: string, ownerId?: string): Promise<DashboardAiSummary> {
    const where: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      isClosed: false,
    };
    if (ownerId) where.ownerId = ownerId;

    const opps = await this.prisma.opportunity.findMany({
      where,
      select: { id: true, name: true, amount: true, ownerId: true, closeDate: true },
      take: 1000,
    });

    if (opps.length === 0) {
      return {
        totalOpen: 0,
        analyzed: 0,
        highRisk: { count: 0, amount: 0, items: [] },
        recentlyFlagged: [],
        coverage: 0,
      };
    }

    const insights = await this.prisma.aIInsight.findMany({
      where: {
        tenantId,
        targetType: 'opportunity',
        targetId: { in: opps.map((o) => o.id) },
        kind: 'OPP_WIN_PROBABILITY',
      },
      select: { targetId: true, payload: true, generatedAt: true },
    });

    const insightMap = new Map(insights.map((i) => [i.targetId, i]));
    const oneDayAgo = Date.now() - 86_400_000;

    const highRisk: HighRiskItem[] = [];
    const recentlyFlagged: HighRiskItem[] = [];
    let highRiskAmount = 0;

    for (const o of opps) {
      const ins = insightMap.get(o.id);
      if (!ins) continue;
      const payload = ins.payload as { score: number; band: string; headline: string; riskFactors?: string[]; nextActions?: { action: string }[] } | null;
      if (!payload || payload.band !== 'low') continue;

      const item: HighRiskItem = {
        opportunityId: o.id,
        name: o.name,
        amount: o.amount != null ? Number(o.amount) : null,
        score: payload.score,
        headline: payload.headline,
        topRisk: payload.riskFactors?.[0] ?? null,
        topAction: payload.nextActions?.[0]?.action ?? null,
        generatedAt: ins.generatedAt.toISOString(),
      };
      highRisk.push(item);
      highRiskAmount += item.amount ?? 0;
      if (ins.generatedAt.getTime() > oneDayAgo) {
        recentlyFlagged.push(item);
      }
    }

    // Sort: lowest score first
    highRisk.sort((a, b) => a.score - b.score);

    return {
      totalOpen: opps.length,
      analyzed: insights.length,
      highRisk: {
        count: highRisk.length,
        amount: highRiskAmount,
        items: highRisk.slice(0, 5),
      },
      recentlyFlagged: recentlyFlagged.slice(0, 5),
      coverage: opps.length > 0 ? Math.round((insights.length / opps.length) * 100) : 0,
    };
  }
}

export interface HighRiskItem {
  opportunityId: string;
  name: string;
  amount: number | null;
  score: number;
  headline: string;
  topRisk: string | null;
  topAction: string | null;
  generatedAt: string;
}

export interface DashboardAiSummary {
  totalOpen: number;
  analyzed: number;
  /** Coverage % of analyzed/total. */
  coverage: number;
  highRisk: {
    count: number;
    amount: number;
    items: HighRiskItem[];
  };
  /** Items whose insight was generated in the last 24 hours and bands as 'low'. */
  recentlyFlagged: HighRiskItem[];
}
