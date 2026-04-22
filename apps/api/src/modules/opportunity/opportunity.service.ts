import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { EVENTS, STAGE_PROBABILITY, STAGE_FORECAST } from '@tokenwave/shared';
import type { OpportunityStage } from '@tokenwave/shared';
import type { RequestUser } from '../../common/types/request-context';

export interface OppListOptions {
  search?: string;
  stage?: string;
  ownerId?: string;
  accountId?: string;
  forecastCategory?: string;
  skip?: number;
  take?: number;
}

export interface AddLineItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  description?: string;
}

@Injectable()
export class OpportunityService extends BaseEntityService {
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

  async list(tenantId: string, opts: OppListOptions = {}) {
    const { search, stage, ownerId, accountId, forecastCategory, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      deletedAt: null,
      ...(stage ? { stage } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(forecastCategory ? { forecastCategory } : {}),
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.opportunity.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { account: true, owner: { select: { id: true, displayName: true, email: true } } },
      }),
      this.prisma.opportunity.count({ where }),
    ]);

    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        lineItems: { include: { product: true } },
        account: true,
        owner: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!opp) throw new NotFoundException(`Opportunity ${id} not found`);
    return opp;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'opportunity', input, undefined, user);

    const stage = (input.stage as OpportunityStage) ?? 'prospecting';
    const probability = STAGE_PROBABILITY[stage] ?? 10;
    const forecastCategory = STAGE_FORECAST[stage] ?? 'pipeline';
    const isClosed = stage === 'closed_won' || stage === 'closed_lost';
    const isWon = stage === 'closed_won';

    // Convert date string fields to Date objects
    const closeDate = input['closeDate']
      ? new Date(input['closeDate'] as string)
      : undefined;

    const data = {
      ...(input as any),
      tenantId,
      ownerId: (input['ownerId'] as string) || user.id,
      probability,
      forecastCategory,
      isClosed,
      isWon,
      createdById: user.id,
      updatedById: user.id,
      ...(closeDate && !isNaN(closeDate.getTime()) ? { closeDate } : {}),
    };

    const opp = await this.prisma.opportunity.create({ data });

    await this.afterCreate(tenantId, 'opportunity', opp as Record<string, unknown>, user);
    return opp;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'opportunity', input, previous as Record<string, unknown>, user);

    const stagePatch: Record<string, unknown> = {};
    if (input.stage && input.stage !== previous.stage) {
      const stage = input.stage as OpportunityStage;
      stagePatch.probability = STAGE_PROBABILITY[stage] ?? previous.probability;
      stagePatch.forecastCategory = STAGE_FORECAST[stage] ?? previous.forecastCategory;
      stagePatch.isClosed = stage === 'closed_won' || stage === 'closed_lost';
      stagePatch.isWon = stage === 'closed_won';
    }

    // Convert date string fields to Date objects
    const closeDatePatch: Record<string, unknown> = {};
    if (input['closeDate'] && typeof input['closeDate'] === 'string') {
      const d = new Date(input['closeDate'] as string);
      if (!isNaN(d.getTime())) closeDatePatch.closeDate = d;
    }

    const opp = await this.prisma.opportunity.update({
      where: { id },
      data: { ...(input as any), ...closeDatePatch, ...stagePatch, updatedById: user.id },
    });

    if (input.stage && input.stage !== previous.stage) {
      this.emitter.emit(EVENTS.OPP_STAGE_CHANGED, { tenantId, opportunityId: id, previousStage: previous.stage, newStage: input.stage, user });
      if (stagePatch.isWon) this.emitter.emit(EVENTS.OPP_WON, { tenantId, opportunityId: id, user });
      if (stagePatch.isClosed && !stagePatch.isWon) this.emitter.emit(EVENTS.OPP_LOST, { tenantId, opportunityId: id, user });
    }

    await this.afterUpdate(tenantId, 'opportunity', opp as Record<string, unknown>, previous as Record<string, unknown>, user);
    return opp;
  }

  async addLineItem(tenantId: string, oppId: string, item: AddLineItemInput) {
    const opp = await this.get(tenantId, oppId);

    const qty = new Decimal(item.quantity);
    const price = new Decimal(item.unitPrice);
    const disc = new Decimal(item.discount ?? 0);
    const subtotal = qty.mul(price).mul(new Decimal(1).minus(disc.div(100)));

    await this.prisma.opportunityLineItem.create({
      data: {
        opportunityId: oppId,
        productId: item.productId,
        quantity: qty,
        unitPrice: price,
        discount: disc,
        subtotal,
        description: item.description,
      },
    });

    return this.recalculateAmount(oppId);
  }

  async removeLineItem(tenantId: string, oppId: string, lineItemId: string) {
    await this.get(tenantId, oppId);

    await this.prisma.opportunityLineItem.deleteMany({
      where: { id: lineItemId, opportunityId: oppId },
    });

    return this.recalculateAmount(oppId);
  }

  async softDelete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.opportunity.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async recalculateAmount(oppId: string) {
    const items = await this.prisma.opportunityLineItem.findMany({ where: { opportunityId: oppId } });
    const amount = items.reduce((sum, li) => sum.plus(li.subtotal), new Decimal(0));
    return this.prisma.opportunity.update({
      where: { id: oppId },
      data: { amount },
    });
  }
}
