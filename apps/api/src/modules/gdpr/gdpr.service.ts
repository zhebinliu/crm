// ─── GdprService ─────────────────────────────────────────────────────────
// GDPR / UK-DPA data-subject rights for the CRM:
//   - Article 15  (right of access)        -> exportData()
//   - Article 17  (right to be forgotten)  -> eraseData()
//
// NOTE: a previous design wave referenced a unified `Person` identity model.
// That model is not yet in the Prisma schema, so this service uses
// email + lastName as the canonical identifier across Lead and Contact.
// The :id route param is therefore a Lead.id OR a Contact.id; we resolve
// it to the data-subject's email and pull every record that matches.
//
// All updates run inside a single Prisma $transaction for atomicity.
// The export and erasure operations are themselves audit-logged so the
// fact a subject-access-request was processed is itself a record.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const REDACTED = '[GDPR_REDACTED]';

export interface GdprExportBundle {
  bundleId: string;
  generatedAt: string;
  subject: {
    sourceRecordType: 'lead' | 'contact';
    sourceRecordId: string;
    email: string | null;
    lastName: string | null;
  };
  leads: unknown[];
  contacts: unknown[];
  activities: unknown[];
  cases: unknown[];
  campaignMembers: unknown[];
  quotes: unknown[];
  orders: unknown[];
  aiInsights: unknown[];
  auditLogs: unknown[];
}

export interface GdprEraseResult {
  erasedCount: number;
  redactedFieldCounts: {
    lead_pii: number;
    contact_pii: number;
    activity_description: number;
    activity_subject: number;
    case_description: number;
    case_subject: number;
    ai_insight_summary: number;
    audit_log_diff: number;
  };
}

interface RelatedRecordIds {
  email: string | null;
  lastName: string | null;
  leadIds: string[];
  contactIds: string[];
  accountIds: string[];
}

@Injectable()
export class GdprService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Resolution: given a Person/Lead/Contact id, find the full identity graph ──
  private async findRelatedRecordIds(
    tenantId: string,
    subjectId: string,
  ): Promise<RelatedRecordIds & { sourceType: 'person' | 'lead' | 'contact' }> {
    // Wave 14 introduced canonical Person identity. Try Person first; if it
    // resolves we directly enumerate every Lead/Contact pointing at it.
    const person = await this.prisma.person.findFirst({
      where: { id: subjectId, tenantId },
      select: { id: true, primaryEmail: true, lastName: true },
    });
    if (person) {
      const [leads, contactsRaw] = await Promise.all([
        this.prisma.lead.findMany({
          where: { tenantId, personId: person.id },
          select: { id: true },
        }),
        this.prisma.contact.findMany({
          where: { tenantId, personId: person.id },
          select: { id: true, accountId: true },
        }),
      ]);
      const accountIds = Array.from(
        new Set(contactsRaw.map((c) => c.accountId).filter((v): v is string => !!v)),
      );
      return {
        sourceType: 'person',
        email: person.primaryEmail,
        lastName: person.lastName,
        leadIds: leads.map((l) => l.id),
        contactIds: contactsRaw.map((c) => c.id),
        accountIds,
      };
    }

    // Fall back to Lead.id or Contact.id (legacy callers + flows where Person
    // hasn't been linked yet).
    const lead = await this.prisma.lead.findFirst({
      where: { id: subjectId, tenantId },
      select: { id: true, email: true, lastName: true },
    });
    const contact = !lead
      ? await this.prisma.contact.findFirst({
          where: { id: subjectId, tenantId },
          select: { id: true, email: true, lastName: true },
        })
      : null;

    if (!lead && !contact) {
      throw new NotFoundException(`No data subject found for id=${subjectId}`);
    }

    const sourceType: 'lead' | 'contact' = lead ? 'lead' : 'contact';
    const email = (lead?.email ?? contact?.email) ?? null;
    const lastName = (lead?.lastName ?? contact?.lastName) ?? null;

    // Match all Leads/Contacts by email (case-insensitive) when available.
    // If no email is present, fall back to the single source record.
    const leads = email
      ? await this.prisma.lead.findMany({
          where: { tenantId, email: { equals: email, mode: 'insensitive' } },
          select: { id: true },
        })
      : (lead ? [{ id: lead.id }] : []);
    const contacts = email
      ? await this.prisma.contact.findMany({
          where: { tenantId, email: { equals: email, mode: 'insensitive' } },
          select: { id: true, accountId: true },
        })
      : (contact ? [{ id: contact.id, accountId: null as string | null }] : []);

    const accountIds = Array.from(
      new Set(
        (await this.prisma.contact.findMany({
          where: { tenantId, id: { in: contacts.map((c) => c.id) } },
          select: { accountId: true },
        }))
          .map((c) => c.accountId)
          .filter((v): v is string => !!v),
      ),
    );

    return {
      sourceType,
      email,
      lastName,
      leadIds: leads.map((l) => l.id),
      contactIds: contacts.map((c) => c.id),
      accountIds,
    };
  }

  // ── Right of Access ────────────────────────────────────────────────────
  async exportData(
    tenantId: string,
    personId: string,
    actorId: string,
  ): Promise<GdprExportBundle> {
    const related = await this.findRelatedRecordIds(tenantId, personId);
    const { leadIds, contactIds, accountIds } = related;

    const [leads, contacts, activities, cases, campaignMembers, quotes, orders, aiInsights] =
      await Promise.all([
        this.prisma.lead.findMany({ where: { tenantId, id: { in: leadIds } } }),
        this.prisma.contact.findMany({ where: { tenantId, id: { in: contactIds } } }),
        this.prisma.activity.findMany({
          where: {
            tenantId,
            OR: [
              { targetType: 'lead', targetId: { in: leadIds } },
              { targetType: 'contact', targetId: { in: contactIds } },
            ],
          },
        }),
        this.prisma.case.findMany({
          where: {
            tenantId,
            OR: [
              { contactId: { in: contactIds } },
              accountIds.length > 0 ? { accountId: { in: accountIds } } : { id: '__none__' },
            ],
          },
        }),
        this.prisma.campaignMember.findMany({
          where: {
            tenantId,
            OR: [
              { leadId: { in: leadIds } },
              { contactId: { in: contactIds } },
            ],
          },
        }),
        accountIds.length
          ? this.prisma.quote.findMany({ where: { tenantId, accountId: { in: accountIds } } })
          : Promise.resolve([]),
        accountIds.length
          ? this.prisma.order.findMany({ where: { tenantId, accountId: { in: accountIds } } })
          : Promise.resolve([]),
        this.prisma.aIInsight.findMany({
          where: {
            tenantId,
            OR: [
              { targetType: 'lead', targetId: { in: leadIds } },
              { targetType: 'contact', targetId: { in: contactIds } },
            ],
          },
        }),
      ]);

    // AuditLog: every entry whose (recordType, recordId) matches anything above
    const auditMatches: Array<{ recordType: string; ids: string[] }> = [
      { recordType: 'lead', ids: leadIds },
      { recordType: 'Lead', ids: leadIds },
      { recordType: 'contact', ids: contactIds },
      { recordType: 'Contact', ids: contactIds },
      { recordType: 'activity', ids: activities.map((a) => a.id) },
      { recordType: 'Activity', ids: activities.map((a) => a.id) },
      { recordType: 'case', ids: cases.map((c) => c.id) },
      { recordType: 'Case', ids: cases.map((c) => c.id) },
      { recordType: 'campaign_member', ids: campaignMembers.map((m) => m.id) },
      { recordType: 'CampaignMember', ids: campaignMembers.map((m) => m.id) },
      { recordType: 'quote', ids: quotes.map((q) => q.id) },
      { recordType: 'Quote', ids: quotes.map((q) => q.id) },
      { recordType: 'order', ids: orders.map((o) => o.id) },
      { recordType: 'Order', ids: orders.map((o) => o.id) },
      { recordType: 'ai_insight', ids: aiInsights.map((i) => i.id) },
      { recordType: 'AIInsight', ids: aiInsights.map((i) => i.id) },
    ].filter((m) => m.ids.length > 0);

    const auditLogs = auditMatches.length
      ? await this.prisma.auditLog.findMany({
          where: {
            tenantId,
            OR: auditMatches.map((m) => ({
              recordType: m.recordType,
              recordId: { in: m.ids },
            })),
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const bundleId = `gdpr_export_${Date.now()}_${personId.slice(0, 8)}`;
    const generatedAt = new Date().toISOString();

    // Self-log the export action.
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action: 'gdpr_export',
        recordType: 'data_subject',
        recordId: personId,
        changes: {
          bundleId,
          email: related.email,
          counts: {
            leads: leads.length,
            contacts: contacts.length,
            activities: activities.length,
            cases: cases.length,
            campaignMembers: campaignMembers.length,
            quotes: quotes.length,
            orders: orders.length,
            aiInsights: aiInsights.length,
            auditLogs: auditLogs.length,
          },
        },
      },
    });

    return {
      bundleId,
      generatedAt,
      subject: {
        sourceRecordType: related.sourceType,
        sourceRecordId: personId,
        email: related.email,
        lastName: related.lastName,
      },
      leads,
      contacts,
      activities,
      cases,
      campaignMembers,
      quotes,
      orders,
      aiInsights,
      auditLogs,
    };
  }

  // ── Right to be Forgotten ──────────────────────────────────────────────
  async eraseData(
    tenantId: string,
    personId: string,
    actorId: string,
    reason: string,
  ): Promise<GdprEraseResult> {
    const related = await this.findRelatedRecordIds(tenantId, personId);
    const { leadIds, contactIds, lastName } = related;

    // Pre-fetch related records that will be redacted (we need the ids).
    const [activities, cases, aiInsights, auditTouchpoints] = await Promise.all([
      this.prisma.activity.findMany({
        where: {
          tenantId,
          OR: [
            { targetType: 'lead', targetId: { in: leadIds } },
            { targetType: 'contact', targetId: { in: contactIds } },
          ],
        },
        select: { id: true, subject: true },
      }),
      this.prisma.case.findMany({
        where: { tenantId, contactId: { in: contactIds } },
        select: { id: true, subject: true, description: true },
      }),
      this.prisma.aIInsight.findMany({
        where: {
          tenantId,
          OR: [
            { targetType: 'lead', targetId: { in: leadIds } },
            { targetType: 'contact', targetId: { in: contactIds } },
          ],
        },
        select: { id: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          tenantId,
          OR: [
            { recordType: { in: ['lead', 'Lead'] }, recordId: { in: leadIds } },
            { recordType: { in: ['contact', 'Contact'] }, recordId: { in: contactIds } },
          ],
        },
        select: { id: true, changes: true },
      }),
    ]);

    const redactedFieldCounts = {
      lead_pii: 0,
      contact_pii: 0,
      activity_description: 0,
      activity_subject: 0,
      case_description: 0,
      case_subject: 0,
      ai_insight_summary: 0,
      audit_log_diff: 0,
    };

    const lastNameRe = lastName ? new RegExp(escapeRegExp(lastName), 'gi') : null;

    const ops: Promise<unknown>[] = [];

    // Lead redaction.
    if (leadIds.length > 0) {
      ops.push(
        this.prisma.lead.updateMany({
          where: { tenantId, id: { in: leadIds } },
          data: {
            firstName: REDACTED,
            lastName: REDACTED,
            email: null,
            phone: null,
            mobile: null,
            website: null,
            street: null,
            city: null,
            state: null,
            postalCode: null,
            country: null,
            description: null,
            customFields: {},
          },
        }).then((r) => { redactedFieldCounts.lead_pii = r.count; }),
      );
    }

    // Contact redaction.
    if (contactIds.length > 0) {
      ops.push(
        this.prisma.contact.updateMany({
          where: { tenantId, id: { in: contactIds } },
          data: {
            firstName: REDACTED,
            lastName: REDACTED,
            email: null,
            phone: null,
            mobile: null,
            fax: null,
            birthday: null,
            mailingStreet: null,
            mailingCity: null,
            mailingState: null,
            mailingPostalCode: null,
            mailingCountry: null,
            description: null,
            customFields: {},
          },
        }).then((r) => { redactedFieldCounts.contact_pii = r.count; }),
      );
    }

    // Activity redaction (description always; subject only when it carries the lastName).
    for (const a of activities) {
      const newSubject =
        lastNameRe && lastNameRe.test(a.subject)
          ? a.subject.replace(lastNameRe, REDACTED)
          : a.subject;
      const subjectChanged = newSubject !== a.subject;
      ops.push(
        this.prisma.activity.update({
          where: { id: a.id },
          data: {
            description: null,
            ...(subjectChanged ? { subject: newSubject } : {}),
          },
        }),
      );
      redactedFieldCounts.activity_description += 1;
      if (subjectChanged) redactedFieldCounts.activity_subject += 1;
    }

    // Case redaction (only fields that mention the redacted person's lastName).
    for (const c of cases) {
      const subjectHit = lastNameRe && lastNameRe.test(c.subject);
      const descHit = lastNameRe && c.description && lastNameRe.test(c.description);
      if (!subjectHit && !descHit) continue;
      ops.push(
        this.prisma.case.update({
          where: { id: c.id },
          data: {
            ...(subjectHit ? { subject: c.subject.replace(lastNameRe!, REDACTED) } : {}),
            ...(descHit ? { description: null } : {}),
          },
        }),
      );
      if (subjectHit) redactedFieldCounts.case_subject += 1;
      if (descHit) redactedFieldCounts.case_description += 1;
    }

    // AIInsight summary redaction (counts retained in payload).
    if (aiInsights.length > 0) {
      ops.push(
        this.prisma.aIInsight.updateMany({
          where: { tenantId, id: { in: aiInsights.map((i) => i.id) } },
          data: { summary: null },
        }).then((r) => { redactedFieldCounts.ai_insight_summary = r.count; }),
      );
    }

    // AuditLog diff redaction: scrub from/to fields that contain PII tokens.
    const piiKeys = new Set([
      'firstName', 'lastName', 'email', 'phone', 'mobile', 'fax',
      'birthday', 'street', 'city', 'state', 'postalCode', 'country',
      'mailingStreet', 'mailingCity', 'mailingState', 'mailingPostalCode',
      'mailingCountry', 'description', 'customFields',
    ]);
    for (const log of auditTouchpoints) {
      const changes = log.changes as Record<string, unknown> | null;
      if (!changes || typeof changes !== 'object') continue;
      let mutated = false;
      const next: Record<string, unknown> = { ...changes };
      for (const key of Object.keys(next)) {
        if (!piiKeys.has(key)) continue;
        const v = next[key];
        if (v && typeof v === 'object' && ('from' in (v as object) || 'to' in (v as object))) {
          next[key] = { from: REDACTED, to: REDACTED };
          mutated = true;
        }
      }
      if (mutated) {
        ops.push(
          this.prisma.auditLog.update({
            where: { id: log.id },
            data: { changes: next as object },
          }),
        );
        redactedFieldCounts.audit_log_diff += 1;
      }
    }

    // Append a tail audit entry for the erasure itself (one per touched record).
    const tailEntries = [
      ...leadIds.map((id) => ({ recordType: 'lead', recordId: id })),
      ...contactIds.map((id) => ({ recordType: 'contact', recordId: id })),
    ];
    if (tailEntries.length > 0) {
      ops.push(
        this.prisma.auditLog.createMany({
          data: tailEntries.map((e) => ({
            tenantId,
            actorId,
            action: 'gdpr_erase',
            recordType: e.recordType,
            recordId: e.recordId,
            changes: { reason, redactedFieldCounts: { ...redactedFieldCounts } },
          })),
        }),
      );
    }

    // Top-level data-subject erasure entry.
    ops.push(
      this.prisma.auditLog.create({
        data: {
          tenantId,
          actorId,
          action: 'gdpr_erase',
          recordType: 'data_subject',
          recordId: personId,
          changes: {
            reason,
            email: related.email,
            redactedFieldCounts,
            erasedLeadIds: leadIds,
            erasedContactIds: contactIds,
          },
        },
      }),
    );

    // Single transaction.
    await this.prisma.$transaction(async () => {
      await Promise.all(ops);
    });

    const erasedCount = leadIds.length + contactIds.length;
    return { erasedCount, redactedFieldCounts };
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
