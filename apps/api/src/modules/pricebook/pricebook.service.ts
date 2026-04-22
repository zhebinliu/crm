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

export interface PriceBookListOptions {
  search?: string;
  isActive?: boolean;
  skip?: number;
  take?: number;
}

@Injectable()
export class PriceBookService extends BaseEntityService {
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

  async list(tenantId: string, opts: PriceBookListOptions = {}) {
    const { search, isActive, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.priceBook.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.priceBook.count({ where }),
    ]);

    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const book = await this.prisma.priceBook.findFirst({
      where: { id, tenantId },
      include: {
        entries: { include: { product: true } },
      },
    });
    if (!book) throw new NotFoundException(`PriceBook ${id} not found`);
    return book;
  }

  async createBook(tenantId: string, name: string, isStandard = false, user?: RequestUser) {
    const input = { tenantId, name, isStandard };
    await this.beforeSave(tenantId, 'pricebook', input as Record<string, unknown>, undefined, user);
    const book = await this.prisma.priceBook.create({ data: input });
    await this.afterCreate(tenantId, 'pricebook', book as Record<string, unknown>, user);
    return book;
  }

  async addEntry(
    tenantId: string,
    bookId: string,
    productId: string,
    unitPrice: number,
    currencyCode = 'CNY',
  ) {
    await this.get(tenantId, bookId);
    return this.prisma.priceBookEntry.create({
      data: {
        priceBookId: bookId,
        productId,
        unitPrice: new Decimal(unitPrice),
        currencyCode,
      },
      include: { product: true },
    });
  }

  async removeEntry(tenantId: string, bookId: string, entryId: string) {
    await this.get(tenantId, bookId);
    await this.prisma.priceBookEntry.deleteMany({ where: { id: entryId, priceBookId: bookId } });
  }

  async setActive(tenantId: string, id: string, isActive: boolean, user?: RequestUser) {
    const previous = await this.get(tenantId, id);
    const book = await this.prisma.priceBook.update({ where: { id }, data: { isActive } });
    await this.afterUpdate(tenantId, 'pricebook', book as Record<string, unknown>, previous as Record<string, unknown>, user);
    return book;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user?: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'pricebook', input, previous as Record<string, unknown>, user);
    const book = await this.prisma.priceBook.update({ where: { id }, data: input as any });
    await this.afterUpdate(tenantId, 'pricebook', book as Record<string, unknown>, previous as Record<string, unknown>, user);
    return book;
  }
}
