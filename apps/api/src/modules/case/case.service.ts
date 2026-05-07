// ─── CaseService ─────────────────────────────────────────────────────────
// Service Cloud minimum: ticket lifecycle (NEW → WORKING → CLOSED), with
// per-tenant auto-numbering (CASE-0001, CASE-0002, ...) via SequenceCounter.
//
// Closes the audit gap "no Case object". This is the minimum needed for
// support workloads — it's not full Service Cloud (no SLA policies, no
// queues, no escalation rules) but it's a real ticket model with comments,
// owner, status, priority, and account/contact linkage.

import { Injectable, NotFoundException } from '@nestjs/common';
import { CaseStatus, CasePriority } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RequestUser } from '../../common/types/request-context';
import { RecycleBinService } from '../recycle-bin/recycle-bin.service';
import { EmbeddingService, caseContent } from '../embeddings/embedding.service';

export interface CaseListOptions {
  search?: string;
  status?: string;
  priority?: string;
  ownerId?: string;
  accountId?: string;
  contactId?: string;
  source?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class CaseService extends BaseEntityService {
  constructor(
    private readonly prisma: PrismaService,
    workflow: WorkflowService,
    validation: ValidationRuleService,
    audit: AuditService,
    emitter: EventEmitter2,
    outbox: OutboxService,
    recycleBin: RecycleBinService,
    embeddings: EmbeddingService,
  ) {
    super(workflow, validation, audit, emitter, outbox, recycleBin);
    this.embeddings = embeddings;
  }

  /** Project a Case into the text we embed for RAG. */
  protected buildEmbeddingContent(
    objectApiName: string,
    record: Record<string, unknown>,
  ): string | null {
    if (objectApiName !== 'case') return null;
    return caseContent({
      caseNumber: record['caseNumber'] as string | null,
      subject: record['subject'] as string | null,
      description: record['description'] as string | null,
      status: record['status'] as string | null,
      priority: record['priority'] as string | null,
      source: record['source'] as string | null,
    });
  }

  async list(tenantId: string, opts: CaseListOptions = {}) {
    const { search, status, priority, ownerId, accountId, contactId, source, skip = 0, take = 20 } = opts;
    const where = {
      tenantId,
      deletedAt: null,
      ...(status ? { status: status as CaseStatus } : {}),
      ...(priority ? { priority: priority as CasePriority } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(contactId ? { contactId } : {}),
      ...(source ? { source } : {}),
      ...(search ? { subject: { contains: search, mode: 'insensitive' as const } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.case.findMany({
        where, skip, take, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          account: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          owner:   { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.prisma.case.count({ where }),
    ]);
    return { data, total };
  }

  async get(tenantId: string, id: string) {
    const c = await this.prisma.case.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        owner:   { select: { id: true, displayName: true, email: true } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException(`Case ${id} not found`);
    return c;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    await this.beforeSave(tenantId, 'case', input, undefined, user);
    const caseNumber = await this.nextCaseNumber(tenantId);

    const data = {
      ...(input as Record<string, unknown>),
      tenantId,
      caseNumber,
      ownerId: (input.ownerId as string) || user.id,
      createdById: user.id,
      updatedById: user.id,
    };

    const created = await this.prisma.case.create({ data: data as never });
    await this.afterCreate(tenantId, 'case', created as Record<string, unknown>, user);
    return created;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'case', input, previous as Record<string, unknown>, user);

    // SLA timestamps
    const patch: Record<string, unknown> = { ...input };
    if (input.status === 'CLOSED_RESOLVED' || input.status === 'CLOSED_NOT_RESOLVED') {
      if (!previous.resolvedAt) patch.resolvedAt = new Date();
    }
    if (
      previous.firstResponseAt == null
      && previous.status === 'NEW'
      && input.status && input.status !== 'NEW'
    ) {
      patch.firstResponseAt = new Date();
    }

    const updated = await this.prisma.case.update({
      where: { id },
      data: { ...patch, updatedById: user.id },
    });
    await this.afterUpdate(tenantId, 'case', updated as Record<string, unknown>, previous as Record<string, unknown>, user);
    return updated;
  }

  async softDelete(tenantId: string, id: string, user?: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.prisma.case.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.afterSoftDelete(tenantId, 'case', previous as Record<string, unknown>, user);
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async addComment(tenantId: string, caseId: string, body: string, isPublic: boolean, user: RequestUser) {
    await this.get(tenantId, caseId);
    return this.prisma.caseComment.create({
      data: { tenantId, caseId, authorId: user.id, body, isPublic },
    });
  }

  async listComments(tenantId: string, caseId: string) {
    await this.get(tenantId, caseId);
    return this.prisma.caseComment.findMany({
      where: { tenantId, caseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** Atomic next number per tenant via SequenceCounter. Format: CASE-NNNN. */
  private async nextCaseNumber(tenantId: string): Promise<string> {
    const ctr = await this.prisma.sequenceCounter.upsert({
      where: { tenantId_key: { tenantId, key: 'case' } },
      update: { value: { increment: 1 } },
      create: { tenantId, key: 'case', value: 1 },
    });
    return `CASE-${String(ctr.value).padStart(4, '0')}`;
  }
}
