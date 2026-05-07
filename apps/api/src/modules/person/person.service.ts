// ─── PersonService ────────────────────────────────────────────────────────
// CRUD + Customer 360 timeline aggregation. The timeline merges signals
// from all touchpoint objects (Lead, Contact, Activity, Case, Quote,
// Order, CampaignMember, AIInsight) into one chronological feed for the
// canonical Person.
//
// The query is N independent finds + sort-merge in-process. For tenants
// with thousands of touchpoints per Person we'd push into a materialized
// view, but for typical sales accounts (<200 touchpoints) this is fine
// and avoids a denormalized `events` table maintenance burden.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityResolutionService } from './identity-resolution.service';

export interface TimelineEntry {
  type: 'lead.created' | 'contact.created' | 'activity' | 'case.created'
      | 'quote.created' | 'order.created' | 'campaign.member' | 'ai.insight';
  at: Date;
  recordId: string;
  recordType: string;
  title: string;
  detail?: string;
  ownerId?: string | null;
}

@Injectable()
export class PersonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityResolutionService,
  ) {}

  // ── CRUD ───────────────────────────────────────────────────────────────

  list(tenantId: string, opts: { search?: string; skip?: number; take?: number }) {
    const skip = Math.max(0, opts.skip ?? 0);
    const take = Math.min(Math.max(1, opts.take ?? 50), 500);
    const where = {
      tenantId,
      mergedIntoId: null,
      deletedAt: null,
      ...(opts.search
        ? {
            OR: [
              { primaryEmailNorm: { contains: opts.search.toLowerCase() } },
              { primaryPhoneNorm: { contains: opts.search.replace(/\D/g, '') } },
              { fullNameNorm: { contains: opts.search.toLowerCase() } },
            ],
          }
        : {}),
    };
    return this.prisma.$transaction([
      this.prisma.person.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take }),
      this.prisma.person.count({ where }),
    ]).then(([data, total]) => ({ data, total }));
  }

  async get(tenantId: string, id: string): Promise<{
    id: string; tenantId: string; primaryEmail: string | null; primaryEmailNorm: string | null;
    primaryPhone: string | null; primaryPhoneNorm: string | null; firstName: string | null;
    lastName: string | null; fullNameNorm: string | null; identifiers: unknown;
    leadCount: number; contactCount: number; campaignCount: number; caseCount: number;
    opportunityCount: number; mergedIntoId: string | null; mergedAt: Date | null;
    createdAt: Date; updatedAt: Date; deletedAt: Date | null;
  }> {
    const person = await this.prisma.person.findFirst({
      where: { tenantId, id, deletedAt: null },
    });
    if (!person) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Person not found' });
    // If merged, transparently follow the redirect
    if (person.mergedIntoId) {
      return this.get(tenantId, person.mergedIntoId);
    }
    return person;
  }

  async getWithRelations(tenantId: string, id: string) {
    const person = await this.get(tenantId, id);
    const [leads, contacts] = await Promise.all([
      this.prisma.lead.findMany({
        where: { tenantId, personId: person.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.contact.findMany({
        where: { tenantId, personId: person.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { ...person, leads, contacts };
  }

  /**
   * Customer 360 timeline. Pulls touchpoints from every relevant table
   * and merges into a single chronological feed.
   */
  async timeline(tenantId: string, personId: string, opts: { take?: number } = {}): Promise<TimelineEntry[]> {
    const person = await this.get(tenantId, personId);
    const take = Math.min(opts.take ?? 100, 500);

    // Find all leads + contacts that point at this person; gather their IDs
    // so we can pull related touchpoints (activities by relatedTo, cases by
    // contactId, campaign members by leadId/contactId).
    const [leads, contacts] = await Promise.all([
      this.prisma.lead.findMany({
        where: { tenantId, personId: person.id },
        select: { id: true, lastName: true, firstName: true, company: true, ownerId: true, createdAt: true, status: true },
      }),
      this.prisma.contact.findMany({
        where: { tenantId, personId: person.id },
        select: { id: true, lastName: true, firstName: true, accountId: true, ownerId: true, createdAt: true },
      }),
    ]);
    const leadIds = leads.map((l) => l.id);
    const contactIds = contacts.map((c) => c.id);

    const entries: TimelineEntry[] = [];

    // Lead created
    for (const l of leads) {
      entries.push({
        type: 'lead.created',
        at: l.createdAt,
        recordId: l.id,
        recordType: 'lead',
        title: `线索创建：${[l.firstName, l.lastName].filter(Boolean).join(' ')} @ ${l.company}`,
        detail: `状态 ${l.status}`,
        ownerId: l.ownerId,
      });
    }
    // Contact created
    for (const c of contacts) {
      entries.push({
        type: 'contact.created',
        at: c.createdAt,
        recordId: c.id,
        recordType: 'contact',
        title: `联系人创建：${[c.firstName, c.lastName].filter(Boolean).join(' ')}`,
        ownerId: c.ownerId,
      });
    }

    // Activities (related to leads/contacts) — Activity uses targetType + targetId.
    const allRelatedIds = [...leadIds, ...contactIds];
    if (allRelatedIds.length > 0) {
      const activities = await this.prisma.activity.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            ...(leadIds.length > 0 ? [{ targetType: 'lead', targetId: { in: leadIds } }] : []),
            ...(contactIds.length > 0 ? [{ targetType: 'contact', targetId: { in: contactIds } }] : []),
          ],
        },
        select: { id: true, type: true, subject: true, dueDate: true, completedAt: true, ownerId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      const typeLabel: Record<string, string> = {
        TASK: '任务', CALL: '通话', EMAIL: '邮件',
        EVENT: '事件', MEETING: '会议', NOTE_LOG: '备忘',
      };
      for (const a of activities) {
        entries.push({
          type: 'activity',
          at: a.createdAt,
          recordId: a.id,
          recordType: 'activity',
          title: `${typeLabel[a.type] ?? a.type}：${a.subject}`,
          detail: a.completedAt ? '已完成' : a.dueDate ? `截止 ${a.dueDate.toISOString().slice(0, 10)}` : undefined,
          ownerId: a.ownerId,
        });
      }
    }

    // Cases — by contactId
    if (contactIds.length > 0) {
      const cases = await this.prisma.case.findMany({
        where: { tenantId, contactId: { in: contactIds } },
        select: { id: true, caseNumber: true, subject: true, status: true, priority: true, ownerId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      for (const c of cases) {
        entries.push({
          type: 'case.created',
          at: c.createdAt,
          recordId: c.id,
          recordType: 'case',
          title: `工单 #${c.caseNumber}：${c.subject}`,
          detail: `${c.status} / ${c.priority}`,
          ownerId: c.ownerId,
        });
      }
    }

    // Campaign membership
    if (leadIds.length > 0 || contactIds.length > 0) {
      const members = await this.prisma.campaignMember.findMany({
        where: {
          tenantId,
          OR: [
            ...(leadIds.length > 0 ? [{ leadId: { in: leadIds } }] : []),
            ...(contactIds.length > 0 ? [{ contactId: { in: contactIds } }] : []),
          ],
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      });
      for (const m of members) {
        entries.push({
          type: 'campaign.member',
          at: m.createdAt,
          recordId: m.id,
          recordType: 'campaignMember',
          title: `加入活动：${m.campaign.name}`,
          detail: `状态 ${m.status}`,
        });
      }
    }

    // Quotes — Quote attaches via accountId, so collect this Person's contacts'
    // accounts and find quotes against those accounts.
    const accountIds = Array.from(new Set(contacts.map((c) => c.accountId).filter(Boolean) as string[]));
    if (accountIds.length > 0) {
      const quotes = await this.prisma.quote.findMany({
        where: { tenantId, accountId: { in: accountIds }, deletedAt: null },
        select: { id: true, quoteNumber: true, name: true, status: true, grandTotal: true, createdAt: true, ownerId: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      for (const q of quotes) {
        entries.push({
          type: 'quote.created',
          at: q.createdAt,
          recordId: q.id,
          recordType: 'quote',
          title: `报价单 #${q.quoteNumber}：${q.name}`,
          detail: `${q.status} / 总额 ${q.grandTotal ?? 0}`,
          ownerId: q.ownerId,
        });
      }
    }

    // AI insights — AIInsight uses targetType + targetId
    if (allRelatedIds.length > 0) {
      const aiInsights = await this.prisma.aIInsight.findMany({
        where: {
          tenantId,
          OR: [
            ...(leadIds.length > 0 ? [{ targetType: 'lead', targetId: { in: leadIds } }] : []),
            ...(contactIds.length > 0 ? [{ targetType: 'contact', targetId: { in: contactIds } }] : []),
          ],
        },
        select: { id: true, kind: true, summary: true, generatedAt: true, targetId: true, targetType: true },
        orderBy: { generatedAt: 'desc' },
        take: 20,
      });
      for (const ai of aiInsights) {
        entries.push({
          type: 'ai.insight',
          at: ai.generatedAt,
          recordId: ai.id,
          recordType: 'aiInsight',
          title: `AI 洞察：${ai.kind}`,
          detail: ai.summary?.slice(0, 120),
        });
      }
    }

    // Sort everything desc by time, cap to take
    entries.sort((a, b) => b.at.getTime() - a.at.getTime());
    return entries.slice(0, take);
  }

  /** Manual merge two persons. Caller must have admin privilege. */
  async merge(tenantId: string, winnerId: string, loserId: string, actorId: string) {
    await this.identity.merge(tenantId, winnerId, loserId, actorId);
    return { ok: true, winnerId };
  }

  /** List dedupe candidates pending review. */
  listDedupeCandidates(tenantId: string, opts: { status?: string; take?: number }) {
    const status = opts.status ?? 'pending';
    return this.prisma.dedupeCandidate.findMany({
      where: { tenantId, status },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.take ?? 50, 200),
    });
  }

  /** Resolve a dedupe candidate: confirm_merge or reject. */
  async resolveCandidate(
    tenantId: string,
    candidateId: string,
    decision: 'confirm_merge' | 'reject',
    actorId: string,
    note?: string,
  ) {
    const c = await this.prisma.dedupeCandidate.findFirst({ where: { id: candidateId, tenantId } });
    if (!c) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Candidate not found' });

    if (decision === 'confirm_merge') {
      // Find the source's current personId, then merge into the candidate
      const sourcePersonId = await this.findSourcePersonId(tenantId, c.sourceType, c.sourceId);
      if (sourcePersonId && sourcePersonId !== c.candidatePersonId) {
        await this.identity.merge(tenantId, c.candidatePersonId, sourcePersonId, actorId);
      }
    }
    return this.prisma.dedupeCandidate.update({
      where: { id: candidateId },
      data: {
        status: decision === 'confirm_merge' ? 'confirmed_merge' : 'rejected',
        resolvedAt: new Date(),
        resolvedById: actorId,
        resolvedNote: note,
      },
    });
  }

  private async findSourcePersonId(tenantId: string, sourceType: string, sourceId: string): Promise<string | null> {
    if (sourceType === 'lead') {
      const r = await this.prisma.lead.findFirst({ where: { id: sourceId, tenantId }, select: { personId: true } });
      return r?.personId ?? null;
    }
    if (sourceType === 'contact') {
      const r = await this.prisma.contact.findFirst({ where: { id: sourceId, tenantId }, select: { personId: true } });
      return r?.personId ?? null;
    }
    return null;
  }
}
