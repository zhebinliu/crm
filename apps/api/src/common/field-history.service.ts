// ─── FieldHistoryService — Salesforce-style field-level history (Wave 18b) ──
//
// Captures every changed field on a record. Independent from
// audit_logs (which tail-trim eventually). Survives soft-deletes and
// recycle-bin purges, so compliance can answer questions like
// "what was the close_date of opp X 6 months ago".
//
// Hooked into BaseEntityService.afterUpdate alongside the existing
// audit.log() call. The same diff shape (`Record<string, {from, to}>`)
// is reused, so no extra computation is needed.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

export type FieldChange = { from: unknown; to: unknown };
export type FieldChanges = Record<string, FieldChange>;

@Injectable()
export class FieldHistoryService {
  private readonly log = new Logger(FieldHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist one row per changed field. No-op when `changes` is empty.
   * Never throws — failures are logged and swallowed so they cannot
   * abort a record write (same defensive contract as AuditService).
   */
  async record(
    tenantId: string,
    recordType: string,
    recordId: string,
    changes: FieldChanges | undefined,
    actorId?: string,
  ): Promise<void> {
    if (!changes) return;
    const entries = Object.entries(changes);
    if (entries.length === 0) return;

    try {
      await this.prisma.fieldHistory.createMany({
        data: entries.map(([fieldName, { from, to }]) => ({
          tenantId,
          recordType,
          recordId,
          fieldName,
          fromValue: toJson(from),
          toValue: toJson(to),
          changedById: actorId ?? null,
        })),
      });
    } catch (e) {
      this.log.warn(
        `field-history record failed for ${recordType}/${recordId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  /**
   * Timeline for a single record. Optional `fieldName` filter to focus
   * on one column (e.g. closeDate). Most-recent first, capped to 500.
   */
  list(
    tenantId: string,
    recordType: string,
    recordId: string,
    fieldName?: string,
    take = 200,
  ) {
    const limit = Math.min(Math.max(1, take), 500);
    return this.prisma.fieldHistory.findMany({
      where: {
        tenantId,
        recordType,
        recordId,
        ...(fieldName ? { fieldName } : {}),
      },
      orderBy: { changedAt: 'desc' },
      take: limit,
    });
  }
}

/**
 * Coerce arbitrary values into something safely round-trippable through
 * Postgres `jsonb`. Date → ISO string; undefined → null; anything that
 * doesn't survive JSON.stringify → null.
 */
function toJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (v === undefined || v === null) return null as unknown as typeof Prisma.JsonNull;
  if (v instanceof Date) return v.toISOString();
  // Test JSON-roundtrippability cheaply.
  try {
    return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
  } catch {
    return null as unknown as typeof Prisma.JsonNull;
  }
}
