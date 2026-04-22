import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Maps object api names to Prisma model delegates, and provides a single
 * place to read/update records by (objectApiName, id). Used by workflow
 * action executors so they don't need to know the full model catalog.
 *
 * Adding a new object: add it to the OBJECT_TO_MODEL map.
 */
@Injectable()
export class RecordMutatorService {
  private readonly log = new Logger(RecordMutatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Lookup a Prisma delegate by object api name. */
  private delegate(objectApiName: string): { findFirst: Function; update: Function } | null {
    const map: Record<string, { findFirst: Function; update: Function }> = {
      lead: this.prisma.lead,
      account: this.prisma.account,
      contact: this.prisma.contact,
      opportunity: this.prisma.opportunity,
      product: this.prisma.product,
      pricebook: this.prisma.priceBook,
      quote: this.prisma.quote,
      order: this.prisma.order,
      contract: this.prisma.contract,
      activity: this.prisma.activity,
    };
    return map[objectApiName.toLowerCase()] ?? null;
  }

  async findById(objectApiName: string, tenantId: string, id: string): Promise<Record<string, unknown> | null> {
    const d = this.delegate(objectApiName);
    if (!d) return null;
    return d.findFirst({ where: { id, tenantId } });
  }

  async updateFields(
    objectApiName: string,
    tenantId: string,
    id: string,
    fields: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const d = this.delegate(objectApiName);
    if (!d) {
      this.log.warn(`No delegate for object "${objectApiName}" — skipping field_update`);
      return null;
    }
    // Separate standard fields from customFields JSON updates.
    const standard: Record<string, unknown> = {};
    const custom: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k.startsWith('customFields.')) {
        custom[k.slice('customFields.'.length)] = v;
      } else {
        standard[k] = v;
      }
    }
    const data: Record<string, unknown> = { ...standard };
    if (Object.keys(custom).length > 0) {
      // merge into existing customFields JSON
      const existing = await this.findById(objectApiName, tenantId, id);
      const cur = (existing?.customFields as Record<string, unknown>) ?? {};
      data.customFields = { ...cur, ...custom };
    }
    return d.update({ where: { id }, data });
  }
}
