import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  tenantId: string;
  actorId?: string;
  action: string;
  recordType: string;
  recordId: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        action: entry.action,
        recordType: entry.recordType,
        recordId: entry.recordId,
        changes: (entry.changes ?? {}) as object,
        ip: entry.ip,
      },
    });
  }

  /** Compute changed fields between two record snapshots. */
  diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    exclude = new Set(['updatedAt', 'createdAt', 'passwordHash']),
  ): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      if (exclude.has(k)) continue;
      const from = before[k];
      const to = after[k];
      const fromStr = JSON.stringify(from);
      const toStr = JSON.stringify(to);
      if (fromStr !== toStr) changes[k] = { from, to };
    }
    return changes;
  }

  list(tenantId: string, recordType?: string, recordId?: string) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(recordType ? { recordType } : {}),
        ...(recordId ? { recordId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Richer query for the /admin/audit-log viewer. Supports filters by
   * record type, action, actor, date range, and free-text record ID prefix.
   * Returns paginated rows + total + an actor lookup map (so the UI doesn't
   * have to issue a second request per row).
   */
  async listForAdmin(
    tenantId: string,
    opts: {
      recordType?: string;
      action?: string;
      actorId?: string;
      since?: string;
      until?: string;
      search?: string;
      skip?: number;
      take?: number;
    },
  ) {
    const where: Record<string, unknown> = { tenantId };
    if (opts.recordType) where.recordType = opts.recordType;
    if (opts.action) where.action = opts.action;
    if (opts.actorId) where.actorId = opts.actorId;
    if (opts.since || opts.until) {
      const range: Record<string, Date> = {};
      if (opts.since) range.gte = new Date(opts.since);
      if (opts.until) range.lte = new Date(opts.until);
      where.createdAt = range;
    }
    if (opts.search) {
      where.OR = [
        { recordId: { contains: opts.search, mode: 'insensitive' } },
        { recordType: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    const skip = Math.max(0, opts.skip ?? 0);
    const take = Math.min(Math.max(1, opts.take ?? 50), 200);

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Resolve actor display names
    const actorIds = Array.from(new Set(rows.map((r) => r.actorId).filter(Boolean) as string[]));
    const actors = actorIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds }, tenantId },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const actorMap: Record<string, { displayName: string; email: string }> = {};
    for (const a of actors) actorMap[a.id] = { displayName: a.displayName, email: a.email };

    return { data: rows, total, actorMap };
  }

  /** Distinct values for filter dropdowns. */
  async filterFacets(tenantId: string) {
    const [recordTypes, actions] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { tenantId },
        select: { recordType: true },
        distinct: ['recordType'],
        take: 50,
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId },
        select: { action: true },
        distinct: ['action'],
        take: 50,
      }),
    ]);
    return {
      recordTypes: recordTypes.map((r) => r.recordType).sort(),
      actions: actions.map((r) => r.action).sort(),
    };
  }
}
