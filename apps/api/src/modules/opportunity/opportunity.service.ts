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
import { RecycleBinService } from '../recycle-bin/recycle-bin.service';
import { EmbeddingService, opportunityContent } from '../embeddings/embedding.service';
import { FlsService } from '../fls/fls.service';
import { RecordTypeService } from '../metadata/record-type.service';

export interface OppListOptions {
  search?: string;
  stage?: string;
  ownerId?: string;
  accountId?: string;
  forecastCategory?: string;
  closeDateFrom?: string;
  closeDateTo?: string;
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
    recycleBin: RecycleBinService,
    private readonly fls: FlsService,
    embeddings: EmbeddingService,
    private readonly recordTypes: RecordTypeService,
  ) {
    super(workflow, validation, audit, emitter, outbox, recycleBin);
    this.embeddings = embeddings;
  }

  /** Project an Opportunity into the text we embed for RAG. */
  protected buildEmbeddingContent(
    objectApiName: string,
    record: Record<string, unknown>,
  ): string | null {
    if (objectApiName !== 'opportunity') return null;
    const account = record['account'] as { name?: string | null } | undefined;
    return opportunityContent({
      name: record['name'] as string | null,
      stage: record['stage'] as string | null,
      amount: record['amount'],
      accountName: account?.name ?? null,
      type: record['type'] as string | null,
      leadSource: record['leadSource'] as string | null,
      nextStep: record['nextStep'] as string | null,
      description: record['description'] as string | null,
    });
  }

  async list(tenantId: string, opts: OppListOptions = {}, user?: RequestUser) {
    const { search, stage, ownerId, accountId, forecastCategory, closeDateFrom, closeDateTo, skip = 0, take = 20 } = opts;

    const closeDateFilter: Record<string, Date> = {};
    if (closeDateFrom) closeDateFilter.gte = new Date(closeDateFrom);
    if (closeDateTo)   closeDateFilter.lte = new Date(closeDateTo);

    const where = {
      tenantId,
      deletedAt: null,
      ...(stage ? { stage } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(forecastCategory ? { forecastCategory } : {}),
      ...(Object.keys(closeDateFilter).length ? { closeDate: closeDateFilter } : {}),
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

    await this.fls.filterReadableMany(user, 'opportunity', data as unknown as Record<string, unknown>[]);
    return { data, total };
  }

  async get(tenantId: string, id: string, user?: RequestUser) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        lineItems: { include: { product: true } },
        account: true,
        owner: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!opp) throw new NotFoundException(`Opportunity ${id} not found`);
    await this.fls.filterReadable(user, 'opportunity', opp as unknown as Record<string, unknown>);
    return opp;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    // Wave 19b: default Record Type before validation so RT-scoped picklists
    // and validation rules see the correct subtype.
    await this.recordTypes.applyDefaults(tenantId, 'opportunity', input);
    await this.fls.assertWritable(user, 'opportunity', input);
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
    await this.fls.assertWritable(user, 'opportunity', input);
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

  /**
   * Update an existing line item — quantity / unitPrice / discount / description.
   * Recomputes subtotal and re-rolls up Opp.amount. Closes the audit gap
   * "Roll-up summary not triggered on line-item edit".
   */
  async updateLineItem(
    tenantId: string,
    oppId: string,
    lineItemId: string,
    patch: Partial<{ quantity: number; unitPrice: number; discount: number; description: string }>,
  ) {
    await this.get(tenantId, oppId);

    const existing = await this.prisma.opportunityLineItem.findFirst({
      where: { id: lineItemId, opportunityId: oppId },
    });
    if (!existing) throw new NotFoundException(`LineItem ${lineItemId} not found on opp ${oppId}`);

    const qty = new Decimal(patch.quantity ?? Number(existing.quantity));
    const price = new Decimal(patch.unitPrice ?? Number(existing.unitPrice));
    const disc = new Decimal(patch.discount ?? Number(existing.discount));
    const subtotal = qty.mul(price).mul(new Decimal(1).minus(disc.div(100)));

    await this.prisma.opportunityLineItem.update({
      where: { id: lineItemId },
      data: {
        quantity: qty,
        unitPrice: price,
        discount: disc,
        subtotal,
        ...(patch.description !== undefined ? { description: patch.description } : {}),
      },
    });

    return this.recalculateAmount(oppId);
  }

  async softDelete(tenantId: string, id: string, user?: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.prisma.opportunity.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.afterSoftDelete(tenantId, 'opportunity', previous as Record<string, unknown>, user);
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
