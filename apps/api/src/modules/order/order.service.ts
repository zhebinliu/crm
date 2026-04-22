import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { EVENTS } from '@tokenwave/shared';
import type { RequestUser } from '../../common/types/request-context';

export interface OrderListOptions {
  accountId?: string;
  status?: string;
  quoteId?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class OrderService extends BaseEntityService {
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

  async list(tenantId: string, opts: OrderListOptions = {}) {
    const { accountId, status, quoteId, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      deletedAt: null,
      ...(accountId ? { accountId } : {}),
      ...(status ? { status } : {}),
      ...(quoteId ? { quoteId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          account: true,
          owner: { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        lineItems: { include: { product: true } },
        account: true,
        quote: { select: { id: true, quoteNumber: true, name: true } },
        owner: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'order', input, undefined, user);
    const orderNumber = await this.nextOrderNumber(tenantId);

    const order = await this.prisma.order.create({
      data: {
        tenantId,
        orderNumber,
        ...(input as any),
        createdById: user.id,
        updatedById: user.id,
      },
    });

    await this.afterCreate(tenantId, 'order', order as Record<string, unknown>, user);
    return order;
  }

  async createFromQuote(tenantId: string, quoteId: string, user: RequestUser) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
      include: { lineItems: true },
    });
    if (!quote) throw new NotFoundException(`Quote ${quoteId} not found`);
    if (!quote.accountId) throw new BadRequestException('Quote must have an account to create an order');

    await this.beforeSave(tenantId, 'order', {}, undefined, user);
    const orderNumber = await this.nextOrderNumber(tenantId);

    const order = await this.prisma.order.create({
      data: {
        tenantId,
        orderNumber,
        quoteId,
        accountId: quote.accountId,
        opportunityId: quote.opportunityId ?? undefined,
        ownerId: user.id,
        effectiveDate: new Date(),
        currencyCode: quote.currencyCode,
        grandTotal: quote.grandTotal,
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        discountAmount: quote.discountAmount,
        shippingAmount: quote.shippingAmount,
        createdById: user.id,
        updatedById: user.id,
        lineItems: {
          create: quote.lineItems.map((li) => ({
            productId: li.productId,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            discount: li.discount,
            taxRate: li.taxRate,
            subtotal: li.subtotal,
            description: li.description,
            sortOrder: li.sortOrder,
          })),
        },
      },
      include: { lineItems: true },
    });

    await this.afterCreate(tenantId, 'order', order as Record<string, unknown>, user);
    return this.get(tenantId, order.id);
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'order', input, previous as Record<string, unknown>, user);
    const order = await this.prisma.order.update({
      where: { id },
      data: { ...(input as any), updatedById: user.id },
    });
    await this.afterUpdate(tenantId, 'order', order as Record<string, unknown>, previous as Record<string, unknown>, user);
    return order;
  }

  async activate(tenantId: string, id: string, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    if (previous.status === 'activated') return previous;

    const order = await this.prisma.order.update({
      where: { id },
      data: { status: 'activated', updatedById: user.id },
    });

    this.emitter.emit(EVENTS.ORDER_ACTIVATED, { tenantId, orderId: id, user });
    await this.afterUpdate(tenantId, 'order', order as Record<string, unknown>, previous as Record<string, unknown>, user);
    return order;
  }

  async softDelete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async nextOrderNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `order.${year}`;

    await this.prisma.$executeRaw`
      INSERT INTO sequence_counters (id, "tenantId", key, value)
      VALUES (gen_random_uuid(), ${tenantId}, ${key}, 1)
      ON CONFLICT ("tenantId", key) DO UPDATE SET value = sequence_counters.value + 1
    `;

    const counter = await this.prisma.sequenceCounter.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });

    const seq = String(counter!.value).padStart(5, '0');
    return `O-${year}-${seq}`;
  }
}
