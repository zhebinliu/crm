// ─── AI context builders ────────────────────────────────────────────────────
//
// Reads Prisma records and shapes them into the typed context objects that
// prompts consume. Centralizing this here means:
//  • prompt files stay free of Prisma types
//  • the same context is reused by both the LLM path and the heuristic stub
//  • the inputHash for cache validity is computed from a single source

import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class AiContextService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Opportunity ────────────────────────────────────────────────────────────

  async buildOpportunityContext(tenantId: string, oppId: string): Promise<OppContextForPrompt> {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: oppId, tenantId, deletedAt: null },
      include: {
        account: true,
        lineItems: { include: { product: true } },
      },
    });
    if (!opp) throw new NotFoundException(`Opportunity ${oppId} not found`);

    const primaryContact = opp.primaryContactId
      ? await this.prisma.contact.findFirst({
          where: { id: opp.primaryContactId, tenantId, deletedAt: null },
        })
      : null;

    const activities = await this.prisma.activity.findMany({
      where: {
        tenantId,
        targetType: 'opportunity',
        targetId: oppId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const now = new Date();
    const closeDate = opp.closeDate;
    const daysToClose = closeDate
      ? Math.round((closeDate.getTime() - now.getTime()) / 86_400_000)
      : null;
    const daysSinceCreated = Math.round(
      (now.getTime() - opp.createdAt.getTime()) / 86_400_000,
    );

    const activityRows = activities.map((a) => ({
      type: a.type,
      subject: a.subject,
      status: a.status,
      daysAgo: Math.round((now.getTime() - a.createdAt.getTime()) / 86_400_000),
      completed: a.status === 'COMPLETED',
    }));

    const meaningful = activityRows.filter(
      (a) => a.completed && (a.type === 'CALL' || a.type === 'MEETING' || a.type === 'EMAIL'),
    );
    const daysSinceLastActivity = meaningful[0]?.daysAgo ?? null;

    const lineItems = opp.lineItems.map((li) => ({
      productName: li.product?.name ?? li.productId,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
      discount: Number(li.discount),
      subtotal: Number(li.subtotal),
    }));

    return {
      opportunity: {
        id: opp.id,
        name: opp.name,
        stage: opp.stage,
        stageZh: STAGE_ZH[opp.stage] ?? opp.stage,
        amount: opp.amount != null ? Number(opp.amount) : null,
        currencyCode: opp.currencyCode,
        closeDate: closeDate?.toISOString().slice(0, 10) ?? null,
        daysToClose,
        probability: opp.probability,
        forecastCategory: opp.forecastCategory,
        type: opp.type,
        leadSource: opp.leadSource,
        nextStep: opp.nextStep,
        description: opp.description,
        isClosed: opp.isClosed,
        isWon: opp.isWon,
        createdAt: opp.createdAt.toISOString(),
        daysSinceCreated,
      },
      account: opp.account
        ? {
            name: opp.account.name,
            industry: opp.account.industry,
            type: opp.account.type,
            annualRevenue: opp.account.annualRevenue != null ? Number(opp.account.annualRevenue) : null,
            employeeCount: opp.account.employeeCount,
          }
        : null,
      primaryContact: primaryContact
        ? {
            fullName: [primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(' '),
            title: primaryContact.title,
            department: primaryContact.department,
            email: primaryContact.email,
          }
        : null,
      lineItems,
      totalLineItems: lineItems.length,
      totalLineItemAmount: lineItems.reduce((s, x) => s + x.subtotal, 0),
      recentActivities: activityRows.slice(0, 15),
      activityCount: {
        last7days: activityRows.filter((a) => a.daysAgo <= 7).length,
        last30days: activityRows.filter((a) => a.daysAgo <= 30).length,
        last90days: activityRows.filter((a) => a.daysAgo <= 90).length,
        total: activityRows.length,
      },
      daysSinceLastActivity,
    };
  }

  async buildActivitySummaryContext(tenantId: string, oppId: string): Promise<ActivitySummaryContext> {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: oppId, tenantId, deletedAt: null },
      include: { account: true },
    });
    if (!opp) throw new NotFoundException(`Opportunity ${oppId} not found`);

    const activities = await this.prisma.activity.findMany({
      where: {
        tenantId,
        targetType: 'opportunity',
        targetId: oppId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const now = new Date();

    return {
      opportunityId: opp.id,
      opportunityName: opp.name,
      stage: opp.stage,
      stageZh: STAGE_ZH[opp.stage] ?? opp.stage,
      accountName: opp.account?.name ?? null,
      activities: activities.map((a) => ({
        type: a.type,
        subject: a.subject,
        status: a.status,
        priority: a.priority,
        daysAgo: Math.round((now.getTime() - a.createdAt.getTime()) / 86_400_000),
        completed: a.status === 'COMPLETED',
        description: a.description,
      })),
    };
  }

  // ── Lead ───────────────────────────────────────────────────────────────────

  async buildLeadContext(tenantId: string, leadId: string): Promise<LeadContextForPrompt> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);

    const activities = await this.prisma.activity.findMany({
      where: {
        tenantId,
        targetType: 'lead',
        targetId: leadId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const now = new Date();
    const daysSinceCreated = Math.round((now.getTime() - lead.createdAt.getTime()) / 86_400_000);

    const activityRows = activities.map((a) => ({
      type: a.type,
      subject: a.subject,
      status: a.status,
      daysAgo: Math.round((now.getTime() - a.createdAt.getTime()) / 86_400_000),
      completed: a.status === 'COMPLETED',
    }));

    return {
      lead: {
        id: lead.id,
        fullName: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
        title: lead.title,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        rating: lead.rating,
        source: lead.source,
        industry: lead.industry,
        annualRevenue: lead.annualRevenue != null ? Number(lead.annualRevenue) : null,
        employeeCount: lead.employeeCount,
        description: lead.description,
        daysSinceCreated,
        isConverted: lead.isConverted,
      },
      recentActivities: activityRows,
      activityCount: {
        last7days: activityRows.filter((a) => a.daysAgo <= 7).length,
        last30days: activityRows.filter((a) => a.daysAgo <= 30).length,
        total: activityRows.length,
      },
    };
  }

  // ── Account ────────────────────────────────────────────────────────────────

  async buildAccountContext(tenantId: string, accountId: string): Promise<AccountContextForPrompt> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, tenantId, deletedAt: null },
    });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);

    const [contacts, opps, activities] = await Promise.all([
      this.prisma.contact.findMany({
        where: { tenantId, accountId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      this.prisma.opportunity.findMany({
        where: { tenantId, accountId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.activity.findMany({
        where: {
          tenantId,
          targetType: 'account',
          targetId: accountId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const now = new Date();
    const daysSinceCreated = Math.round(
      (now.getTime() - account.createdAt.getTime()) / 86_400_000,
    );

    const openOpps = opps.filter((o) => !o.isClosed).map((o) => ({
      name: o.name,
      stage: o.stage,
      stageZh: STAGE_ZH[o.stage] ?? o.stage,
      amount: o.amount != null ? Number(o.amount) : null,
      closeDate: o.closeDate.toISOString().slice(0, 10),
      daysToClose: Math.round((o.closeDate.getTime() - now.getTime()) / 86_400_000),
    }));

    const closedOpps = opps.filter((o) => o.isClosed).slice(0, 5).map((o) => ({
      name: o.name,
      isWon: o.isWon,
      amount: o.amount != null ? Number(o.amount) : null,
      closedAt: o.updatedAt.toISOString().slice(0, 10),
    }));

    const totalOpenAmount = openOpps.reduce((s, o) => s + (o.amount ?? 0), 0);

    const recentActivities = activities.map((a) => ({
      type: a.type,
      subject: a.subject,
      daysAgo: Math.round((now.getTime() - a.createdAt.getTime()) / 86_400_000),
      completed: a.status === 'COMPLETED',
    }));
    const meaningful = recentActivities.filter(
      (a) => a.completed && (a.type === 'CALL' || a.type === 'MEETING' || a.type === 'EMAIL'),
    );
    const daysSinceLastActivity = meaningful[0]?.daysAgo ?? null;

    return {
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        industry: account.industry,
        annualRevenue: account.annualRevenue != null ? Number(account.annualRevenue) : null,
        employeeCount: account.employeeCount,
        rating: account.rating,
        billingCity: account.billingCity,
        description: account.description,
        daysSinceCreated,
      },
      contacts: contacts.map((c, i) => ({
        fullName: [c.firstName, c.lastName].filter(Boolean).join(' '),
        title: c.title,
        department: c.department,
        isPrimary: i === 0,
      })),
      openOpps,
      closedOpps,
      recentActivities,
      daysSinceLastActivity,
      totalOpenAmount,
    };
  }

  // ── Hashing for cache validity ─────────────────────────────────────────────

  /**
   * Stable fingerprint of context inputs. Daily-grade time fields are bucketed
   * to today's date so a same-day re-fetch hits cache.
   */
  hashContext(ctx: unknown): string {
    return createHash('sha256').update(JSON.stringify(ctx)).digest('hex').slice(0, 32);
  }
}
