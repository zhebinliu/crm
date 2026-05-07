// ─── IdentityResolutionService ───────────────────────────────────────────
// Customer 360 core: maps incoming Lead/Contact records to a canonical
// Person identity. Runs configured IdentityRules in priority order; the
// first match wins (auto-link), unless the rule has surfaceOnly=true in
// which case a DedupeCandidate is parked for human review.
//
// Comparators:
//   • exact_email                  — match on normalized primaryEmail
//   • exact_phone                  — match on normalized primaryPhone
//   • exact_name_email_domain      — same fullNameNorm + same email domain
//   • fuzzy_name                   — Levenshtein-1 on fullNameNorm
//   • first_letter_lastname_email  — first(firstName)+lastName+email-local part
//
// Tenant has zero rules by default — DedupeService.bootstrap() seeds a
// sensible default of [exact_email, exact_phone, fuzzy_name].

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface IncomingIdentity {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  source?: 'lead' | 'contact';
  sourceId?: string;
}

export interface ResolutionResult {
  personId: string;
  created: boolean;       // true if a fresh Person was created
  matchedRuleId?: string; // which rule matched (when linking to existing)
  candidateId?: string;   // DedupeCandidate row id (when surfaceOnly fired)
}

@Injectable()
export class IdentityResolutionService {
  private readonly log = new Logger(IdentityResolutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve an incoming identity to a Person. ALWAYS returns a personId —
   * either an existing match (auto-linked or candidate-flagged) or a fresh
   * Person row. Caller is responsible for setting record.personId in their
   * own transaction.
   */
  async resolve(tenantId: string, identity: IncomingIdentity): Promise<ResolutionResult> {
    const norm = normalize(identity);
    const rules = await this.activeRules(tenantId);

    for (const rule of rules) {
      const match = await this.runComparator(tenantId, rule.comparator, norm);
      if (!match) continue;

      // Surface-only rule: don't auto-link, park for review.
      if (rule.surfaceOnly && identity.source && identity.sourceId) {
        const candidate = await this.prisma.dedupeCandidate.create({
          data: {
            tenantId,
            sourceType: identity.source,
            sourceId: identity.sourceId,
            candidatePersonId: match.id,
            ruleId: rule.id,
            score: scoreFor(rule.comparator),
          },
        });
        // Still create a fresh Person so the record has somewhere to link
        const fresh = await this.createPerson(tenantId, norm);
        return { personId: fresh.id, created: true, candidateId: candidate.id };
      }

      // Auto-link — increment counter on the matched Person
      await this.bumpCounter(match.id, identity.source);
      return { personId: match.id, created: false, matchedRuleId: rule.id };
    }

    // No rule matched — fresh Person
    const created = await this.createPerson(tenantId, norm);
    await this.bumpCounter(created.id, identity.source);
    return { personId: created.id, created: true };
  }

  /**
   * Manually merge two Persons. The loser is soft-merged into the winner;
   * its leads/contacts get re-pointed; mergedIntoId tracks the redirect.
   */
  async merge(tenantId: string, winnerId: string, loserId: string, _actorId?: string): Promise<void> {
    if (winnerId === loserId) throw new Error('Cannot merge a Person into itself');
    const [winner, loser] = await Promise.all([
      this.prisma.person.findFirst({ where: { id: winnerId, tenantId } }),
      this.prisma.person.findFirst({ where: { id: loserId, tenantId } }),
    ]);
    if (!winner || !loser) throw new Error('Person not found in tenant');

    await this.prisma.$transaction([
      this.prisma.lead.updateMany({ where: { tenantId, personId: loserId }, data: { personId: winnerId } }),
      this.prisma.contact.updateMany({ where: { tenantId, personId: loserId }, data: { personId: winnerId } }),
      this.prisma.person.update({
        where: { id: loserId },
        data: { mergedIntoId: winnerId, mergedAt: new Date() },
      }),
      this.prisma.person.update({
        where: { id: winnerId },
        data: {
          leadCount: winner.leadCount + loser.leadCount,
          contactCount: winner.contactCount + loser.contactCount,
          campaignCount: winner.campaignCount + loser.campaignCount,
          caseCount: winner.caseCount + loser.caseCount,
          opportunityCount: winner.opportunityCount + loser.opportunityCount,
          // If the winner is missing identity fields, fill from the loser
          primaryEmail: winner.primaryEmail ?? loser.primaryEmail,
          primaryEmailNorm: winner.primaryEmailNorm ?? loser.primaryEmailNorm,
          primaryPhone: winner.primaryPhone ?? loser.primaryPhone,
          primaryPhoneNorm: winner.primaryPhoneNorm ?? loser.primaryPhoneNorm,
        },
      }),
    ]);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async activeRules(tenantId: string) {
    return this.prisma.identityRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async runComparator(
    tenantId: string,
    comparator: string,
    norm: NormalizedIdentity,
  ): Promise<{ id: string } | null> {
    switch (comparator) {
      case 'exact_email':
        if (!norm.primaryEmailNorm) return null;
        return this.prisma.person.findFirst({
          where: { tenantId, primaryEmailNorm: norm.primaryEmailNorm, mergedIntoId: null, deletedAt: null },
          select: { id: true },
        });
      case 'exact_phone':
        if (!norm.primaryPhoneNorm) return null;
        return this.prisma.person.findFirst({
          where: { tenantId, primaryPhoneNorm: norm.primaryPhoneNorm, mergedIntoId: null, deletedAt: null },
          select: { id: true },
        });
      case 'exact_name_email_domain': {
        if (!norm.fullNameNorm || !norm.primaryEmailNorm) return null;
        const at = norm.primaryEmailNorm.indexOf('@');
        if (at < 0) return null;
        const domain = norm.primaryEmailNorm.slice(at);
        const candidates = await this.prisma.person.findMany({
          where: { tenantId, fullNameNorm: norm.fullNameNorm, mergedIntoId: null, deletedAt: null },
          select: { id: true, primaryEmailNorm: true },
          take: 20,
        });
        const hit = candidates.find((c) => c.primaryEmailNorm?.endsWith(domain));
        return hit ? { id: hit.id } : null;
      }
      case 'fuzzy_name': {
        if (!norm.fullNameNorm) return null;
        // Narrow by lastName (typically a high-cardinality token) when present.
        // For names where the surname doesn't match, no fuzzy comparison is
        // meaningful — they're different people. This works for both
        // "John Smith" (first-name-first) and "张三" (surname-first) once
        // lastName is correctly populated.
        const where: Record<string, unknown> = {
          tenantId,
          mergedIntoId: null,
          deletedAt: null,
        };
        if (norm.lastName) where.lastName = norm.lastName;
        const candidates = await this.prisma.person.findMany({
          where: where as Record<string, unknown>,
          select: { id: true, fullNameNorm: true },
          take: 100,
        });
        const target = norm.fullNameNorm;
        for (const c of candidates) {
          if (!c.fullNameNorm) continue;
          if (c.fullNameNorm === target) return { id: c.id };
          if (levenshtein(c.fullNameNorm, target) <= 1) return { id: c.id };
        }
        return null;
      }
      case 'first_letter_lastname_email': {
        if (!norm.lastName || !norm.primaryEmailNorm || !norm.firstInitial) return null;
        // Match: J.Doe with email j.doe@... or jdoe@...
        const emailLocal = norm.primaryEmailNorm.split('@')[0] ?? '';
        const compact = `${norm.firstInitial}${norm.lastName}`.toLowerCase();
        const dotted = `${norm.firstInitial}.${norm.lastName}`.toLowerCase();
        if (emailLocal !== compact && emailLocal !== dotted) return null;
        return this.prisma.person.findFirst({
          where: {
            tenantId,
            primaryEmailNorm: norm.primaryEmailNorm,
            mergedIntoId: null,
            deletedAt: null,
          },
          select: { id: true },
        });
      }
      default:
        this.log.warn(`Unknown comparator: ${comparator}`);
        return null;
    }
  }

  private async createPerson(tenantId: string, norm: NormalizedIdentity) {
    return this.prisma.person.create({
      data: {
        tenantId,
        primaryEmail: norm.primaryEmail,
        primaryEmailNorm: norm.primaryEmailNorm,
        primaryPhone: norm.primaryPhone,
        primaryPhoneNorm: norm.primaryPhoneNorm,
        firstName: norm.firstName,
        lastName: norm.lastName,
        fullNameNorm: norm.fullNameNorm,
        identifiers: norm.identifiers as object,
      },
    });
  }

  private async bumpCounter(personId: string, source?: 'lead' | 'contact') {
    if (!source) return;
    const field = source === 'lead' ? 'leadCount' : 'contactCount';
    await this.prisma.person.update({
      where: { id: personId },
      data: { [field]: { increment: 1 } },
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

interface NormalizedIdentity {
  firstName?: string | null;
  lastName?: string | null;
  fullNameNorm?: string | null;
  firstInitial?: string | null;
  primaryEmail?: string | null;
  primaryEmailNorm?: string | null;
  primaryPhone?: string | null;
  primaryPhoneNorm?: string | null;
  identifiers: Array<{ kind: string; value: string }>;
}

function normalize(i: IncomingIdentity): NormalizedIdentity {
  const firstName = (i.firstName ?? null)?.trim() || null;
  const lastName = (i.lastName ?? null)?.trim() || null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const fullNameNorm = fullName ? fullName.toLowerCase() : null;
  const firstInitial = firstName ? firstName[0]!.toLowerCase() : null;

  const primaryEmail = (i.email ?? null)?.trim() || null;
  const primaryEmailNorm = primaryEmail ? primaryEmail.toLowerCase() : null;

  // Phone: prefer mobile if present, fall back to phone. Strip non-digits.
  const rawPhone = i.mobile?.trim() || i.phone?.trim() || null;
  const primaryPhone = rawPhone || null;
  const primaryPhoneNorm = rawPhone ? rawPhone.replace(/\D/g, '') || null : null;

  const identifiers: Array<{ kind: string; value: string }> = [];
  if (primaryEmailNorm) identifiers.push({ kind: 'email', value: primaryEmailNorm });
  if (primaryPhoneNorm) identifiers.push({ kind: 'phone', value: primaryPhoneNorm });

  return {
    firstName,
    lastName,
    fullNameNorm,
    firstInitial,
    primaryEmail,
    primaryEmailNorm,
    primaryPhone,
    primaryPhoneNorm,
    identifiers,
  };
}

function scoreFor(comparator: string): number {
  switch (comparator) {
    case 'exact_email':
    case 'exact_phone':
      return 1.0;
    case 'exact_name_email_domain':
      return 0.85;
    case 'first_letter_lastname_email':
      return 0.8;
    case 'fuzzy_name':
      return 0.7;
    default:
      return 0.5;
  }
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Two-row dp
  let prev = new Array(b.length + 1).fill(0);
  let cur = new Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}
