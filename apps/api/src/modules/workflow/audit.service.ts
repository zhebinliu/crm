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
}
