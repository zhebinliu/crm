import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import type { RequestUser } from '../../common/types/request-context';

export interface AccountListOptions {
  search?: string;
  type?: string;
  ownerId?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class AccountService extends BaseEntityService {
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

  async list(tenantId: string, opts: AccountListOptions = {}) {
    const { search, type, ownerId, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      deletedAt: null,
      ...(type ? { type } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { website: { contains: search, mode: 'insensitive' as const } },
              { industry: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.account.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { contacts: { where: { deletedAt: null } }, opportunities: { where: { deletedAt: null } } },
          },
        },
      }),
      this.prisma.account.count({ where }),
    ]);

    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: {
          select: { contacts: { where: { deletedAt: null } }, opportunities: { where: { deletedAt: null } } },
        },
      },
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'account', input, undefined, user);
    const data = {
      ...input,
      tenantId,
      ownerId: (input['ownerId'] as string) || user.id,
    };
    const account = await this.prisma.account.create({ data: data as any });
    await this.afterCreate(tenantId, 'account', account as Record<string, unknown>, user);
    return account;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'account', input, previous as Record<string, unknown>, user);
    const account = await this.prisma.account.update({
      where: { id },
      data: { ...input, updatedAt: new Date() } as any,
    });
    await this.afterUpdate(tenantId, 'account', account as Record<string, unknown>, previous as Record<string, unknown>, user);
    return account;
  }

  async softDelete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    return this.prisma.account.update({
      where: { id },
      data: { deletedAt: new Date() } as any,
    });
  }
}
