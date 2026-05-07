// ─── CampaignService ─────────────────────────────────────────────────────
// Marketing minimum: campaigns + members. Status transitions and member
// counts auto-tally (numSent / numResponses / numConverted) based on
// CampaignMember rows.
//
// Closes audit gap "no Campaign object". Not full Marketing Cloud (no
// segmentation engine, no journey builder, no email-send orchestration)
// but the canonical attribution model is here.

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CampaignType, CampaignStatus, CampaignMemberStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RequestUser } from '../../common/types/request-context';

const RESPONSE_STATES: CampaignMemberStatus[] = ['CLICKED', 'RESPONDED', 'CONVERTED'];

@Injectable()
export class CampaignService extends BaseEntityService {
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

  async list(tenantId: string, opts: { status?: string; type?: string; ownerId?: string; skip?: number; take?: number } = {}) {
    const { status, type, ownerId, skip = 0, take = 20 } = opts;
    const where = {
      tenantId, deletedAt: null,
      ...(status ? { status: status as CampaignStatus } : {}),
      ...(type ? { type: type as CampaignType } : {}),
      ...(ownerId ? { ownerId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, displayName: true } },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const c = await this.prisma.campaign.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { owner: { select: { id: true, displayName: true } } },
    });
    if (!c) throw new NotFoundException(`Campaign ${id} not found`);
    return c;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'campaign', input, undefined, user);
    const data = {
      ...(input as Record<string, unknown>),
      tenantId,
      ownerId: (input.ownerId as string) || user.id,
    };
    const created = await this.prisma.campaign.create({ data: data as never });
    await this.afterCreate(tenantId, 'campaign', created as Record<string, unknown>, user);
    return created;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'campaign', input, previous as Record<string, unknown>, user);
    const updated = await this.prisma.campaign.update({ where: { id }, data: input });
    await this.afterUpdate(tenantId, 'campaign', updated as Record<string, unknown>, previous as Record<string, unknown>, user);
    return updated;
  }

  async softDelete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.campaign.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Members ──────────────────────────────────────────────────────────────

  async listMembers(tenantId: string, campaignId: string, opts: { status?: string; skip?: number; take?: number } = {}) {
    await this.get(tenantId, campaignId);
    const { status, skip = 0, take = 50 } = opts;
    const where = {
      tenantId, campaignId,
      ...(status ? { status: status as CampaignMemberStatus } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.campaignMember.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          lead:    { select: { id: true, firstName: true, lastName: true, company: true } },
          contact: { select: { id: true, firstName: true, lastName: true, accountId: true } },
        },
      }),
      this.prisma.campaignMember.count({ where }),
    ]);
    return { data, total };
  }

  async addMember(
    tenantId: string, campaignId: string,
    args: { leadId?: string; contactId?: string; status?: CampaignMemberStatus },
  ) {
    if (!args.leadId && !args.contactId) {
      throw new BadRequestException('Must specify leadId or contactId');
    }
    await this.get(tenantId, campaignId);
    const member = await this.prisma.campaignMember.create({
      data: {
        tenantId, campaignId,
        leadId: args.leadId, contactId: args.contactId,
        status: args.status ?? 'SENT',
      },
    });
    await this.recountAggregates(tenantId, campaignId);
    return member;
  }

  async updateMemberStatus(
    tenantId: string, campaignId: string, memberId: string,
    status: CampaignMemberStatus,
  ) {
    await this.get(tenantId, campaignId);
    const updated = await this.prisma.campaignMember.update({
      where: { id: memberId },
      data: {
        status,
        ...(RESPONSE_STATES.includes(status) ? { respondedAt: new Date() } : {}),
      },
    });
    await this.recountAggregates(tenantId, campaignId);
    return updated;
  }

  async removeMember(tenantId: string, campaignId: string, memberId: string) {
    await this.get(tenantId, campaignId);
    await this.prisma.campaignMember.deleteMany({ where: { id: memberId, tenantId } });
    await this.recountAggregates(tenantId, campaignId);
  }

  /** Recompute Campaign aggregate counts from CampaignMember table. */
  private async recountAggregates(tenantId: string, campaignId: string): Promise<void> {
    const grouped = await this.prisma.campaignMember.groupBy({
      by: ['status'],
      where: { tenantId, campaignId },
      _count: { _all: true },
    });
    let numSent = 0, numResponses = 0, numConverted = 0;
    for (const row of grouped) {
      const c = row._count._all;
      numSent += c;
      if (RESPONSE_STATES.includes(row.status)) numResponses += c;
      if (row.status === 'CONVERTED') numConverted += c;
    }
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { numSent, numResponses, numConverted },
    });
  }
}
