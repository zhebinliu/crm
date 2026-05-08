// ─── SlaService ──────────────────────────────────────────────────────────
// SLA Policy + Milestone engine (Wave 19h).
//
// Workflow:
//   1. SlaPolicy.caseFilter is a JSON predicate ({priority:"HIGH"} or
//      {OR:[{...}]}). pickPolicy returns the highest-priority active
//      policy that matches a case.
//   2. Account/Contact-level Entitlement can override the default policy.
//   3. applyToCase picks a policy + creates first_response + resolution
//      milestones based on businessHours/holidays/timezone math.
//   4. tickBreach (5-min cron) flips overdue pending milestones to
//      breached and emits sla.breached on the outbox.
//
// Business-hours math: addBusinessMinutes walks forward in 1-min ticks
// until `minutes` minutes of in-business-hours / non-holiday time has
// accumulated. Naive but correct, ~50 LOC.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../../common/outbox.service';

type CaseFilter = Record<string, unknown>;

export interface BusinessHours {
  // mon..sun: [openHour, closeHour] in 24h, or omitted/null = closed.
  mon?: [number, number] | null;
  tue?: [number, number] | null;
  wed?: [number, number] | null;
  thu?: [number, number] | null;
  fri?: [number, number] | null;
  sat?: [number, number] | null;
  sun?: [number, number] | null;
}

@Injectable()
export class SlaService {
  private readonly log = new Logger(SlaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  // ── Policy selection ────────────────────────────────────────────────

  /**
   * Returns the first active SLA policy whose caseFilter matches the
   * given case, ordered by priority (lowest number wins, like SF).
   */
  async pickPolicy(
    tenantId: string,
    caseRecord: Record<string, unknown>,
  ): Promise<{ id: string; firstResponseTargetMinutes: number; resolutionTargetMinutes: number;
              businessHours: CaseFilter; holidays: string[] } | null> {
    const policies = await this.prisma.slaPolicy.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    for (const p of policies) {
      if (matchesPredicate(caseRecord, p.caseFilter as CaseFilter)) {
        return {
          id: p.id,
          firstResponseTargetMinutes: p.firstResponseTargetMinutes,
          resolutionTargetMinutes: p.resolutionTargetMinutes,
          businessHours: p.businessHours as CaseFilter,
          holidays: p.holidays,
        };
      }
    }
    return null;
  }

  /**
   * Apply SLA policy to a case: pick policy (or override via Entitlement),
   * create milestones, and write back the resolution target onto Case.
   */
  async applyToCase(tenantId: string, caseId: string): Promise<void> {
    try {
      const c = await this.prisma.case.findFirst({
        where: { id: caseId, tenantId, deletedAt: null },
      });
      if (!c) return;

      // Entitlement override beats default policy.
      let policy = await this.entitlementOverride(tenantId, c.accountId, c.contactId);
      if (!policy) policy = await this.pickPolicy(tenantId, c as unknown as Record<string, unknown>);
      if (!policy) return;

      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const tz = (tenant?.settings as Record<string, unknown> | null)?.['timezone'] as string | undefined;

      const start = c.createdAt;
      const businessHours = policy.businessHours as unknown as BusinessHours;
      const holidays = policy.holidays;

      const frTarget = addBusinessMinutes(
        start, policy.firstResponseTargetMinutes, businessHours, holidays, tz,
      );
      const resTarget = addBusinessMinutes(
        start, policy.resolutionTargetMinutes, businessHours, holidays, tz,
      );

      await this.prisma.$transaction([
        this.prisma.slaMilestone.create({
          data: {
            tenantId, policyId: policy.id, caseId,
            type: 'first_response', targetAt: frTarget, status: 'pending',
          },
        }),
        this.prisma.slaMilestone.create({
          data: {
            tenantId, policyId: policy.id, caseId,
            type: 'resolution', targetAt: resTarget, status: 'pending',
          },
        }),
        this.prisma.case.update({
          where: { id: caseId },
          data: { slaTargetAt: resTarget },
        }),
      ]);
    } catch (e) {
      this.log.warn(`applyToCase(${caseId}) failed: ${(e as Error).message}`);
    }
  }

  private async entitlementOverride(
    tenantId: string,
    accountId: string | null | undefined,
    contactId: string | null | undefined,
  ) {
    const now = new Date();
    const where = {
      tenantId,
      status: 'active',
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [
        ...(accountId ? [{ accountId }] : []),
        ...(contactId ? [{ contactId }] : []),
      ],
    };
    if (where.OR.length === 0) return null;
    const ent = await this.prisma.entitlement.findFirst({
      where, include: { slaPolicy: true },
      orderBy: { startsAt: 'desc' },
    });
    if (!ent) return null;
    return {
      id: ent.slaPolicy.id,
      firstResponseTargetMinutes: ent.slaPolicy.firstResponseTargetMinutes,
      resolutionTargetMinutes: ent.slaPolicy.resolutionTargetMinutes,
      businessHours: ent.slaPolicy.businessHours as CaseFilter,
      holidays: ent.slaPolicy.holidays,
    };
  }

  // ── Milestone progression ────────────────────────────────────────────

  async markFirstResponse(tenantId: string, caseId: string): Promise<void> {
    const m = await this.prisma.slaMilestone.findFirst({
      where: { tenantId, caseId, type: 'first_response', status: 'pending' },
    });
    if (m) {
      await this.prisma.slaMilestone.update({
        where: { id: m.id },
        data: { status: 'completed', completedAt: new Date() },
      });
    }
    await this.prisma.case.updateMany({
      where: { id: caseId, tenantId, firstResponseAt: null },
      data: { firstResponseAt: new Date() },
    });
  }

  async markResolved(tenantId: string, caseId: string): Promise<void> {
    const m = await this.prisma.slaMilestone.findFirst({
      where: { tenantId, caseId, type: 'resolution', status: 'pending' },
    });
    if (m) {
      await this.prisma.slaMilestone.update({
        where: { id: m.id },
        data: { status: 'completed', completedAt: new Date() },
      });
    }
    await this.prisma.case.updateMany({
      where: { id: caseId, tenantId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  async listMilestones(tenantId: string, caseId: string) {
    return this.prisma.slaMilestone.findMany({
      where: { tenantId, caseId },
      orderBy: { targetAt: 'asc' },
    });
  }

  // ── Breach detection ────────────────────────────────────────────────

  /**
   * Find pending milestones with targetAt < now → flip to breached and
   * emit sla.breached. Returns count breached. Visible for tests.
   */
  async tickBreach(now: Date = new Date()): Promise<number> {
    const overdue = await this.prisma.slaMilestone.findMany({
      where: { status: 'pending', targetAt: { lt: now } },
      take: 200,
    });
    let breached = 0;
    for (const m of overdue) {
      try {
        await this.prisma.slaMilestone.update({
          where: { id: m.id },
          data: { status: 'breached', breachedAt: now },
        });
        await this.outbox.emit(
          m.tenantId, 'sla.breached', 'sla_milestone', m.id,
          { caseId: m.caseId, milestoneId: m.id, type: m.type, targetAt: m.targetAt },
        );
        breached++;
      } catch (e) {
        this.log.warn(`tickBreach(${m.id}) failed: ${(e as Error).message}`);
      }
    }
    return breached;
  }

  @Cron('*/5 * * * *')
  async cronTickBreach(): Promise<void> {
    try {
      const n = await this.tickBreach();
      if (n > 0) this.log.log(`SLA tickBreach: ${n} milestones marked breached`);
    } catch (e) {
      this.log.error(`cronTickBreach failed: ${(e as Error).message}`);
    }
  }

  // ── Policy CRUD ─────────────────────────────────────────────────────

  async listPolicies(tenantId: string) {
    return this.prisma.slaPolicy.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getPolicy(tenantId: string, id: string) {
    const p = await this.prisma.slaPolicy.findFirst({
      where: { id, tenantId },
    });
    if (!p) throw new NotFoundException(`SlaPolicy ${id} not found`);
    return p;
  }

  async createPolicy(tenantId: string, input: Record<string, unknown>) {
    return this.prisma.slaPolicy.create({
      data: {
        tenantId,
        apiName: input.apiName as string,
        label: input.label as string,
        description: (input.description as string | null) ?? null,
        caseFilter: (input.caseFilter ?? {}) as never,
        businessHours: (input.businessHours ?? {}) as never,
        holidays: (input.holidays as string[] | null) ?? [],
        firstResponseTargetMinutes: (input.firstResponseTargetMinutes as number | null) ?? 60,
        resolutionTargetMinutes: (input.resolutionTargetMinutes as number | null) ?? 1440,
        isActive: input.isActive === undefined ? true : Boolean(input.isActive),
        priority: (input.priority as number | null) ?? 100,
      },
    });
  }

  async updatePolicy(tenantId: string, id: string, input: Record<string, unknown>) {
    await this.getPolicy(tenantId, id);
    const data: Record<string, unknown> = {};
    for (const key of [
      'label', 'description', 'caseFilter', 'businessHours', 'holidays',
      'firstResponseTargetMinutes', 'resolutionTargetMinutes', 'isActive', 'priority',
    ]) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    return this.prisma.slaPolicy.update({ where: { id }, data });
  }

  async deletePolicy(tenantId: string, id: string) {
    await this.getPolicy(tenantId, id);
    await this.prisma.slaPolicy.delete({ where: { id } });
  }
}

// ── Predicate evaluator ───────────────────────────────────────────────────

function matchesPredicate(record: Record<string, unknown>, filter: CaseFilter | null | undefined): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  // Boolean operators
  if (Array.isArray((filter as Record<string, unknown>)['AND'])) {
    return ((filter as Record<string, unknown>)['AND'] as CaseFilter[])
      .every((f) => matchesPredicate(record, f));
  }
  if (Array.isArray((filter as Record<string, unknown>)['OR'])) {
    return ((filter as Record<string, unknown>)['OR'] as CaseFilter[])
      .some((f) => matchesPredicate(record, f));
  }
  if ((filter as Record<string, unknown>)['NOT']) {
    return !matchesPredicate(record, (filter as Record<string, unknown>)['NOT'] as CaseFilter);
  }

  // Field-level: each key must match. Value can be primitive or
  // {in: [...]} / {not: ...}.
  for (const [k, v] of Object.entries(filter)) {
    const recVal = record[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const op = v as Record<string, unknown>;
      if ('in' in op) {
        if (!Array.isArray(op['in']) || !op['in'].includes(recVal)) return false;
        continue;
      }
      if ('not' in op) {
        if (recVal === op['not']) return false;
        continue;
      }
    }
    if (recVal !== v) return false;
  }
  return true;
}

// ── Business-hours math ──────────────────────────────────────────────────

const DAY_KEYS: Array<keyof BusinessHours> = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Walk forward from `start` until `minutes` minutes of in-business time
 * have accumulated, skipping non-business hours and holiday dates.
 * If businessHours is empty/none, treats every minute as business
 * (= naive wall-clock add).
 *
 * Tenant timezone (`tz`) shifts the day-of-week / hour bucketing. We use
 * Intl.DateTimeFormat to pull the local hour/minute/weekday in that tz
 * once per minute step (cheap; loop is bounded by minutes argument).
 */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  businessHours: BusinessHours,
  holidays: string[] = [],
  tz?: string,
): Date {
  if (minutes <= 0) return new Date(start.getTime());
  const empty =
    !businessHours || DAY_KEYS.every((d) => !businessHours[d]);
  if (empty) {
    return new Date(start.getTime() + minutes * 60_000);
  }
  const holidaySet = new Set(holidays);

  // Step in 1-minute ticks; safe because 1440 min/day × ~30 day max =
  // ~43k iterations, < 5ms.
  let cursor = new Date(start.getTime());
  let remaining = minutes;
  // Cap iterations defensively to avoid runaway loops on bad data.
  const cap = minutes * 24 * 30 + 60;
  let iter = 0;
  while (remaining > 0 && iter < cap) {
    cursor = new Date(cursor.getTime() + 60_000);
    iter++;
    if (isBusinessMinute(cursor, businessHours, holidaySet, tz)) {
      remaining--;
    }
  }
  return cursor;
}

function isBusinessMinute(
  d: Date,
  businessHours: BusinessHours,
  holidays: Set<string>,
  tz?: string,
): boolean {
  // Pull day-of-week + hour in target timezone.
  let dow: number;
  let hour: number;
  let isoDate: string;
  if (tz) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const wk = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wk);
    hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const yr = parts.find((p) => p.type === 'year')?.value ?? '0000';
    const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
    const da = parts.find((p) => p.type === 'day')?.value ?? '01';
    isoDate = `${yr}-${mo}-${da}`;
  } else {
    dow = d.getUTCDay();
    hour = d.getUTCHours();
    isoDate = d.toISOString().slice(0, 10);
  }
  if (holidays.has(isoDate)) return false;
  const window = businessHours[DAY_KEYS[dow]!];
  if (!window) return false;
  const [open, close] = window;
  return hour >= open && hour < close;
}
