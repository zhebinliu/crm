import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { EVENTS } from '@tokenwave/shared';
import type { RequestUser } from '../../common/types/request-context';

export interface ContractListOptions {
  accountId?: string;
  status?: string;
  search?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class ContractService extends BaseEntityService {
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

  async list(tenantId: string, opts: ContractListOptions = {}) {
    const { accountId, status, search, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      deletedAt: null,
      ...(accountId ? { accountId } : {}),
      ...(status ? { status } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { account: true },
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { account: true },
    });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);
    return contract;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'contract', input, undefined, user);
    const contractNumber = await this.nextContractNumber(tenantId);

    // Convert date-only strings to full ISO format for Prisma
    const data: Record<string, unknown> = {
      tenantId,
      contractNumber,
      ...input,
      createdById: user.id,
      updatedById: user.id,
    };
    for (const key of ['startDate', 'endDate', 'signedAt']) {
      if (typeof data[key] === 'string') {
        const d = new Date(data[key] as string);
        if (!isNaN(d.getTime())) data[key] = d;
      }
    }

    const contract = await this.prisma.contract.create({ data: data as any });

    await this.afterCreate(tenantId, 'contract', contract as Record<string, unknown>, user);
    return contract;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'contract', input, previous as Record<string, unknown>, user);
    const contract = await this.prisma.contract.update({
      where: { id },
      data: { ...(input as any), updatedById: user.id },
    });
    await this.afterUpdate(tenantId, 'contract', contract as Record<string, unknown>, previous as Record<string, unknown>, user);
    return contract;
  }

  async activate(tenantId: string, id: string, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    if (previous.status === 'activated') return previous;
    if (!['draft', 'in_approval'].includes(previous.status)) {
      throw new BadRequestException(`Cannot activate a contract in status '${previous.status}'`);
    }

    const contract = await this.prisma.contract.update({
      where: { id },
      data: { status: 'activated', updatedById: user.id },
    });

    this.emitter.emit(EVENTS.CONTRACT_ACTIVATED, { tenantId, contractId: id, user });
    await this.afterUpdate(tenantId, 'contract', contract as Record<string, unknown>, previous as Record<string, unknown>, user);
    return contract;
  }

  async terminate(tenantId: string, id: string, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    if (previous.status === 'terminated') return previous;
    if (previous.status !== 'activated') {
      throw new BadRequestException(`Cannot terminate a contract in status '${previous.status}'`);
    }

    const contract = await this.prisma.contract.update({
      where: { id },
      data: { status: 'terminated', updatedById: user.id },
    });

    this.emitter.emit(EVENTS.CONTRACT_TERMINATED, { tenantId, contractId: id, user });
    await this.afterUpdate(tenantId, 'contract', contract as Record<string, unknown>, previous as Record<string, unknown>, user);
    return contract;
  }

  async softDelete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.contract.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async nextContractNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `contract.${year}`;

    await this.prisma.$executeRaw`
      INSERT INTO sequence_counters (id, "tenantId", key, value)
      VALUES (gen_random_uuid(), ${tenantId}, ${key}, 1)
      ON CONFLICT ("tenantId", key) DO UPDATE SET value = sequence_counters.value + 1
    `;

    const counter = await this.prisma.sequenceCounter.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });

    const seq = String(counter!.value).padStart(5, '0');
    return `C-${year}-${seq}`;
  }
}
