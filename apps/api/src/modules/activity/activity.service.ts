import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { AiService } from '../ai/ai.service';
import type { RequestUser } from '../../common/types/request-context';
import { ActivityType, ActivityStatus } from '@prisma/client';
import { RecycleBinService } from '../recycle-bin/recycle-bin.service';
import { EmbeddingService, activityContent } from '../embeddings/embedding.service';
import { FlsService } from '../fls/fls.service';

export interface ActivityListOptions {
  ownerId?: string;
  targetType?: string;
  targetId?: string;
  status?: string;
  type?: string;
  dueBefore?: Date | string;
  skip?: number;
  take?: number;
}

@Injectable()
export class ActivityService extends BaseEntityService {
  constructor(
    private readonly prisma: PrismaService,
    workflow: WorkflowService,
    validation: ValidationRuleService,
    audit: AuditService,
    emitter: EventEmitter2,
    outbox: OutboxService,
    recycleBin: RecycleBinService,
    private readonly ai: AiService,
    embeddings: EmbeddingService,
    private readonly fls: FlsService,
  ) {
    super(workflow, validation, audit, emitter, outbox, recycleBin);
    this.embeddings = embeddings;
  }

  /** Project an Activity into the text we embed for RAG. */
  protected buildEmbeddingContent(
    objectApiName: string,
    record: Record<string, unknown>,
  ): string | null {
    if (objectApiName !== 'activity') return null;
    return activityContent({
      subject: record['subject'] as string | null,
      type: record['type'] as string | null,
      description: record['description'] as string | null,
      status: record['status'] as string | null,
      priority: record['priority'] as string | null,
      dueDate: record['dueDate'],
    });
  }

  async list(tenantId: string, opts: ActivityListOptions = {}, user?: RequestUser) {
    const { ownerId, targetType, targetId, status, type, dueBefore, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      deletedAt: null,
      ...(ownerId ? { ownerId } : {}),
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
      ...(status ? { status: status as ActivityStatus } : {}),
      ...(type ? { type: type as ActivityType } : {}),
      ...(dueBefore
        ? { dueDate: { lte: new Date(dueBefore) } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        skip,
        take,
        orderBy: { dueDate: 'asc' },
        include: { owner: { select: { id: true, displayName: true, email: true } } },
      }),
      this.prisma.activity.count({ where }),
    ]);

    // Wave 16a: strip FLS-gated fields from each row.
    await this.fls.filterReadableMany(user, 'activity', data as unknown as Record<string, unknown>[]);
    return { data, total };
  }

  async get(tenantId: string, id: string, user?: RequestUser) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { owner: { select: { id: true, displayName: true, email: true } } },
    });
    if (!activity) throw new NotFoundException(`Activity ${id} not found`);
    // Wave 16a: strip FLS-gated fields. No-op if user not provided.
    await this.fls.filterReadable(user, 'activity', activity as unknown as Record<string, unknown>);
    return activity;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    // Wave 16a: reject writes to fields the user lacks writePermission for.
    await this.fls.assertWritable(user, 'activity', input);
    await this.beforeSave(tenantId, 'activity', input, undefined, user);

    const data = {
      ...(input as any),
      // Normalize type and status to uppercase to match Prisma enums
      type: typeof input['type'] === 'string' ? (input['type'] as string).toUpperCase() : input['type'],
      status: typeof input['status'] === 'string' ? (input['status'] as string).toUpperCase() : undefined,
      tenantId,
      ownerId: (input['ownerId'] as string) || user.id,
      createdById: user.id,
      updatedById: user.id,
    };

    const activity = await this.prisma.activity.create({ data });

    await this.afterCreate(tenantId, 'activity', activity as Record<string, unknown>, user);
    return activity;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    // Wave 16a: reject writes to fields the user lacks writePermission for.
    await this.fls.assertWritable(user, 'activity', input);
    // Internal previous-fetch — pass no user so we get the unfiltered record for diffing.
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'activity', input, previous as Record<string, unknown>, user);

    const activity = await this.prisma.activity.update({
      where: { id },
      data: { ...(input as any), updatedById: user.id },
    });

    await this.afterUpdate(tenantId, 'activity', activity as Record<string, unknown>, previous as Record<string, unknown>, user);
    return activity;
  }

  async complete(tenantId: string, id: string, user: RequestUser) {
    const previous = await this.get(tenantId, id);

    const activity = await this.prisma.activity.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        updatedById: user.id,
      },
    });

    await this.afterUpdate(tenantId, 'activity', activity as Record<string, unknown>, previous as Record<string, unknown>, user);

    // Fire-and-forget AI auto-summary if description is empty. Wraps in
    // setImmediate so the HTTP response returns instantly; LLM latency
    // (typically 2-8s) doesn't block the user.
    if (!activity.description || activity.description.trim().length === 0) {
      setImmediate(() => {
        this.ai.writeActivityCompletionSummary(tenantId, activity.id).catch(() => null);
      });
    }

    return activity;
  }

  async softDelete(tenantId: string, id: string, user?: RequestUser) {
    const previous = await this.get(tenantId, id);
    await this.prisma.activity.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.afterSoftDelete(tenantId, 'activity', previous as Record<string, unknown>, user);
  }
}
