import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import type { RequestUser } from '../../common/types/request-context';

export interface QuoteListOptions {
  opportunityId?: string;
  accountId?: string;
  status?: string;
  skip?: number;
  take?: number;
}

export interface AddQuoteLineItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  description?: string;
}

@Injectable()
export class QuoteService extends BaseEntityService {
  constructor(
    private readonly prisma: PrismaService,
    workflow: WorkflowService,
    validation: ValidationRuleService,
    audit: AuditService,
    emitter: EventEmitter2,
    outbox: OutboxService,
  ) {
    super(workflow, validation, audit, emitter, outbox);
  }

  async list(tenantId: string, opts: QuoteListOptions = {}) {
    const { opportunityId, accountId, status, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      deletedAt: null,
      ...(opportunityId ? { opportunityId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(status ? { status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.quote.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          account: true,
          opportunity: { select: { id: true, name: true } },
          owner: { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.prisma.quote.count({ where }),
    ]);

    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        lineItems: { include: { product: true } },
        account: true,
        opportunity: { select: { id: true, name: true, stage: true } },
        owner: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!quote) throw new NotFoundException(`Quote ${id} not found`);
    return quote;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'quote', input, undefined, user);
    const quoteNumber = await this.nextQuoteNumber(tenantId);

    const quote = await this.prisma.quote.create({
      data: {
        tenantId,
        quoteNumber,
        ownerId: (input['ownerId'] as string) || user.id,
        ...(input as any),
        createdById: user.id,
        updatedById: user.id,
      },
    });

    await this.afterCreate(tenantId, 'quote', quote as Record<string, unknown>, user);
    return quote;
  }

  async createFromOpportunity(tenantId: string, oppId: string, user: RequestUser) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: oppId, tenantId, deletedAt: null },
      include: { lineItems: true },
    });
    if (!opp) throw new NotFoundException(`Opportunity ${oppId} not found`);

    await this.beforeSave(tenantId, 'quote', {}, undefined, user);
    const quoteNumber = await this.nextQuoteNumber(tenantId);

    const quote = await this.prisma.quote.create({
      data: {
        tenantId,
        quoteNumber,
        name: `Quote for ${opp.name}`,
        opportunityId: oppId,
        accountId: opp.accountId,
        ownerId: user.id,
        currencyCode: opp.currencyCode,
        createdById: user.id,
        updatedById: user.id,
        lineItems: {
          create: opp.lineItems.map((li) => ({
            productId: li.productId,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            discount: li.discount,
            taxRate: new Decimal(0),
            subtotal: li.subtotal,
            description: li.description,
            sortOrder: li.sortOrder,
          })),
        },
      },
      include: { lineItems: true },
    });

    await this.recalculateTotals(quote.id);
    await this.afterCreate(tenantId, 'quote', quote as Record<string, unknown>, user);
    return this.get(tenantId, quote.id);
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'quote', input, previous as Record<string, unknown>, user);
    const quote = await this.prisma.quote.update({
      where: { id },
      data: { ...(input as any), updatedById: user.id },
    });
    await this.afterUpdate(tenantId, 'quote', quote as Record<string, unknown>, previous as Record<string, unknown>, user);
    return quote;
  }

  async addLineItem(tenantId: string, quoteId: string, item: AddQuoteLineItemInput) {
    await this.get(tenantId, quoteId);

    const qty = new Decimal(item.quantity);
    const price = new Decimal(item.unitPrice);
    const disc = new Decimal(item.discount ?? 0);
    const taxRate = new Decimal(item.taxRate ?? 0);
    const subtotal = qty.mul(price).mul(new Decimal(1).minus(disc.div(100)));

    await this.prisma.quoteLineItem.create({
      data: {
        quoteId,
        productId: item.productId,
        quantity: qty,
        unitPrice: price,
        discount: disc,
        taxRate,
        subtotal,
        description: item.description,
      },
    });

    return this.recalculateTotals(quoteId);
  }

  async removeLineItem(tenantId: string, quoteId: string, itemId: string) {
    await this.get(tenantId, quoteId);
    await this.prisma.quoteLineItem.deleteMany({ where: { id: itemId, quoteId } });
    return this.recalculateTotals(quoteId);
  }

  async softDelete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.quote.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async recalculateTotals(quoteId: string) {
    const items = await this.prisma.quoteLineItem.findMany({ where: { quoteId } });

    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });

    const subtotal = items.reduce((sum, li) => sum.plus(li.subtotal), new Decimal(0));
    const taxAmount = items.reduce(
      (sum, li) => sum.plus(li.subtotal.mul(li.taxRate).div(100)),
      new Decimal(0),
    );
    const discountAmount = quote?.discountAmount ?? new Decimal(0);
    const shippingAmount = quote?.shippingAmount ?? new Decimal(0);
    const grandTotal = subtotal.minus(discountAmount).plus(taxAmount).plus(shippingAmount);

    return this.prisma.quote.update({
      where: { id: quoteId },
      data: { subtotal, taxAmount, grandTotal },
    });
  }

  private async nextQuoteNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `quote.${year}`;

    await this.prisma.$executeRaw`
      INSERT INTO sequence_counters (id, "tenantId", key, value)
      VALUES (gen_random_uuid(), ${tenantId}, ${key}, 1)
      ON CONFLICT ("tenantId", key) DO UPDATE SET value = sequence_counters.value + 1
    `;

    const counter = await this.prisma.sequenceCounter.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });

    const seq = String(counter!.value).padStart(5, '0');
    return `Q-${year}-${seq}`;
  }
}
