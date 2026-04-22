import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import type { RequestUser } from '../../common/types/request-context';

export interface ContactListOptions {
  accountId?: string;
  search?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class ContactService extends BaseEntityService {
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

  async list(tenantId: string, opts: ContactListOptions = {}) {
    const { accountId, search, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      deletedAt: null,
      ...(accountId ? { accountId } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { title: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { account: { select: { id: true, name: true } } },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    return contact;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'contact', input, undefined, user);
    const data = {
      ...input,
      tenantId,
      ownerId: (input['ownerId'] as string) || user.id,
    };
    const contact = await this.prisma.contact.create({ data: data as any });
    await this.afterCreate(tenantId, 'contact', contact as Record<string, unknown>, user);
    return contact;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'contact', input, previous as Record<string, unknown>, user);
    const contact = await this.prisma.contact.update({
      where: { id },
      data: { ...input, updatedAt: new Date() } as any,
    });
    await this.afterUpdate(tenantId, 'contact', contact as Record<string, unknown>, previous as Record<string, unknown>, user);
    return contact;
  }

  async softDelete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    return this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date() } as any,
    });
  }
}
