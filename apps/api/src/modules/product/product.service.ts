import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import type { RequestUser } from '../../common/types/request-context';

export interface ProductListOptions {
  search?: string;
  family?: string;
  isActive?: boolean;
  skip?: number;
  take?: number;
}

@Injectable()
export class ProductService extends BaseEntityService {
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

  async list(tenantId: string, opts: ProductListOptions = {}) {
    const { search, family, isActive, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      deletedAt: null,
      ...(family ? { family } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'product', input, undefined, user);
    const product = await this.prisma.product.create({ data: { tenantId, ...(input as any) } });
    await this.afterCreate(tenantId, 'product', product as Record<string, unknown>, user);
    return product;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'product', input, previous as Record<string, unknown>, user);
    const product = await this.prisma.product.update({ where: { id }, data: input as any });
    await this.afterUpdate(tenantId, 'product', product as Record<string, unknown>, previous as Record<string, unknown>, user);
    return product;
  }

  async softDelete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
