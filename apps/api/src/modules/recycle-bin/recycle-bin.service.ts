// ─── RecycleBinService ───────────────────────────────────────────────────
// SF-style Recycle Bin (Wave 16b).
//
// Every soft-delete writes a RecycleBinEntry. Users have 30 days to
// restore (Salesforce gives 15; we extend to 30 to match Chinese CRM
// convention — 30 days 保留期). After purgeAfter, a daily cron job
// physically removes both the entry and the underlying record.

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type RecycleableRecordType =
  | 'lead'
  | 'account'
  | 'contact'
  | 'opportunity'
  | 'quote'
  | 'order'
  | 'contract'
  | 'activity'
  | 'case';

export const RECYCLE_RETENTION_DAYS = 30;

export interface ListRecycleBinOptions {
  recordType?: RecycleableRecordType | string;
  search?: string;
  take?: number;
  skip?: number;
}

@Injectable()
export class RecycleBinService {
  private readonly log = new Logger(RecycleBinService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hookable: subclass services should call this AFTER a successful soft-delete.
   * `snapshot` is a small JSON used for rendering the recycle bin row in the UI
   * (e.g. {"name": "李明", "company": "ACME"}).
   */
  async record(
    tenantId: string,
    recordType: RecycleableRecordType | string,
    recordId: string,
    snapshot: Record<string, unknown> = {},
    actorId?: string,
  ) {
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + RECYCLE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    return this.prisma.recycleBinEntry.create({
      data: {
        tenantId,
        recordType,
        recordId,
        deletedAt: now,
        deletedById: actorId ?? null,
        purgeAfter,
        snapshot: snapshot as never,
      },
    });
  }

  async list(tenantId: string, opts: ListRecycleBinOptions = {}) {
    const { recordType, search, take = 50, skip = 0 } = opts;
    const now = new Date();

    const where: Record<string, unknown> = {
      tenantId,
      restoredAt: null,
      purgeAfter: { gt: now },
      ...(recordType ? { recordType } : {}),
    };

    if (search) {
      // Match against snapshot JSON (best-effort, postgres @> partial match).
      where['OR'] = [
        { recordId: { contains: search } },
        // Postgres JSON path search via Prisma's `path` filter is limited,
        // so we use a `string_to_text` style fallback at the SQL level for now.
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.recycleBinEntry.findMany({
        where: where as never,
        orderBy: { deletedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.recycleBinEntry.count({ where: where as never }),
    ]);

    return { data, total };
  }

  async restore(tenantId: string, entryId: string, actorId?: string) {
    const entry = await this.prisma.recycleBinEntry.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) throw new NotFoundException(`Recycle bin entry ${entryId} not found`);
    if (entry.restoredAt) throw new BadRequestException(`Entry already restored at ${entry.restoredAt.toISOString()}`);
    if (entry.purgeAfter.getTime() < Date.now()) {
      throw new BadRequestException(`Entry expired (purgeAfter=${entry.purgeAfter.toISOString()})`);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.dispatchUndelete(tx, entry.recordType, entry.recordId);
      await tx.recycleBinEntry.update({
        where: { id: entry.id },
        data: { restoredAt: new Date() },
      });
    });

    this.log.log(`Restored ${entry.recordType}:${entry.recordId} (entry ${entry.id}) by ${actorId ?? 'system'}`);
    return { ok: true };
  }

  async purge(tenantId: string, entryId: string, actorId?: string) {
    const entry = await this.prisma.recycleBinEntry.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) throw new NotFoundException(`Recycle bin entry ${entryId} not found`);

    await this.prisma.$transaction(async (tx) => {
      await this.dispatchHardDelete(tx, entry.recordType, entry.recordId);
      await tx.recycleBinEntry.delete({ where: { id: entry.id } });
    });

    this.log.warn(`Purged ${entry.recordType}:${entry.recordId} (entry ${entry.id}) by ${actorId ?? 'system'}`);
    return { ok: true };
  }

  /**
   * Cron-eligible: hard-deletes everything past purgeAfter that hasn't been
   * restored. Returns the count of entries purged.
   */
  async purgeExpired(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.recycleBinEntry.findMany({
      where: { restoredAt: null, purgeAfter: { lt: now } },
      take: 5000,
    });

    let purged = 0;
    for (const entry of expired) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.dispatchHardDelete(tx, entry.recordType, entry.recordId);
          await tx.recycleBinEntry.delete({ where: { id: entry.id } });
        });
        purged += 1;
      } catch (e) {
        this.log.error(
          `Failed to purge ${entry.recordType}:${entry.recordId} entry=${entry.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    if (purged > 0) {
      this.log.log(`purgeExpired: removed ${purged}/${expired.length} expired entries`);
    }
    return purged;
  }

  // ── Dispatch helpers ─────────────────────────────────────────────────────

  /** Flip the underlying record's deletedAt back to null. */
  private async dispatchUndelete(tx: any, recordType: string, recordId: string): Promise<void> {
    const data = { deletedAt: null };
    switch (recordType) {
      case 'lead':        await tx.lead.update({ where: { id: recordId }, data }); return;
      case 'account':     await tx.account.update({ where: { id: recordId }, data }); return;
      case 'contact':     await tx.contact.update({ where: { id: recordId }, data }); return;
      case 'opportunity': await tx.opportunity.update({ where: { id: recordId }, data }); return;
      case 'quote':       await tx.quote.update({ where: { id: recordId }, data }); return;
      case 'order':       await tx.order.update({ where: { id: recordId }, data }); return;
      case 'contract':    await tx.contract.update({ where: { id: recordId }, data }); return;
      case 'activity':    await tx.activity.update({ where: { id: recordId }, data }); return;
      case 'case':        await tx.case.update({ where: { id: recordId }, data }); return;
      default:
        throw new BadRequestException(`Unsupported recordType for restore: ${recordType}`);
    }
  }

  /** Hard-delete the underlying record (irreversible). */
  private async dispatchHardDelete(tx: any, recordType: string, recordId: string): Promise<void> {
    const where = { id: recordId };
    switch (recordType) {
      case 'lead':        await tx.lead.deleteMany({ where }); return;
      case 'account':     await tx.account.deleteMany({ where }); return;
      case 'contact':     await tx.contact.deleteMany({ where }); return;
      case 'opportunity': await tx.opportunity.deleteMany({ where }); return;
      case 'quote':       await tx.quote.deleteMany({ where }); return;
      case 'order':       await tx.order.deleteMany({ where }); return;
      case 'contract':    await tx.contract.deleteMany({ where }); return;
      case 'activity':    await tx.activity.deleteMany({ where }); return;
      case 'case':        await tx.case.deleteMany({ where }); return;
      default:
        throw new BadRequestException(`Unsupported recordType for purge: ${recordType}`);
    }
  }
}
