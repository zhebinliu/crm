import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { EmbeddingService, accountContent } from '../embeddings/embedding.service';
import { FlsService } from '../fls/fls.service';
import type { RequestUser } from '../../common/types/request-context';
import { RecycleBinService } from '../recycle-bin/recycle-bin.service';
import { AssignmentEngineService } from '../territory/assignment-engine.service';

export interface AccountListOptions {
  search?: string;
  type?: string;
  ownerId?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class AccountService extends BaseEntityService {
  private readonly accLog = new Logger(AccountService.name);

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
    // Wave 19f: optional so existing tests / mocks don't have to provide it.
    @Optional() private readonly assignmentEngine?: AssignmentEngineService,
  ) {
    super(workflow, validation, audit, emitter, outbox, recycleBin);
    this.embeddings = embeddings;
  }

  /**
   * Fire-and-forget territory rule re-evaluation. Failure logs a warning;
   * Account writes never fail because of territory bookkeeping.
   */
  private runTerritoryAssignment(tenantId: string, account: Record<string, unknown>): void {
    if (!this.assignmentEngine) return;
    void this.assignmentEngine
      .applyOnAccountWrite(tenantId, account)
      .catch((e) => this.accLog.warn(
        `Territory assignment failed for account=${account['id']}: ${e instanceof Error ? e.message : e}`,
      ));
  }

  /** Project an Account into the text we embed for RAG. */
  protected buildEmbeddingContent(
    objectApiName: string,
    record: Record<string, unknown>,
  ): string | null {
    if (objectApiName !== 'account') return null;
    return accountContent({
      name: record['name'] as string | null,
      industry: record['industry'] as string | null,
      type: record['type'] as string | null,
      website: record['website'] as string | null,
      description: record['description'] as string | null,
    });
  }

  async list(tenantId: string, opts: AccountListOptions = {}, user?: RequestUser) {
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

    // Wave 16a: strip FLS-gated fields from each row.
    await this.fls.filterReadableMany(user, 'account', data as unknown as Record<string, unknown>[]);
    return { data, total };
  }

  async get(tenantId: string, id: string, user?: RequestUser) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: {
          select: { contacts: { where: { deletedAt: null } }, opportunities: { where: { deletedAt: null } } },
        },
      },
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    // Wave 16a: strip FLS-gated fields. No-op if user not provided.
    await this.fls.filterReadable(user, 'account', account as unknown as Record<string, unknown>);
    return account;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    // Wave 16a: reject writes to fields the user lacks writePermission for.
    await this.fls.assertWritable(user, 'account', input);
    await this.beforeSave(tenantId, 'account', input, undefined, user);
    const data = {
      ...input,
      tenantId,
      ownerId: (input['ownerId'] as string) || user.id,
    };
    const account = await this.prisma.account.create({ data: data as any });
    await this.afterCreate(tenantId, 'account', account as Record<string, unknown>, user);
    this.runTerritoryAssignment(tenantId, account as Record<string, unknown>);
    return account;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    // Wave 16a: reject writes to fields the user lacks writePermission for.
    await this.fls.assertWritable(user, 'account', input);
    // Internal previous-fetch — pass no user so we get the unfiltered record for diffing.
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'account', input, previous as Record<string, unknown>, user);
    const account = await this.prisma.account.update({
      where: { id },
      data: { ...input, updatedAt: new Date() } as any,
    });
    await this.afterUpdate(tenantId, 'account', account as Record<string, unknown>, previous as Record<string, unknown>, user);
    this.runTerritoryAssignment(tenantId, account as Record<string, unknown>);
    return account;
  }

  async softDelete(tenantId: string, id: string, user?: RequestUser) {
    const previous = await this.get(tenantId, id);
    const account = await this.prisma.account.update({
      where: { id },
      data: { deletedAt: new Date() } as any,
    });
    await this.afterSoftDelete(tenantId, 'account', previous as Record<string, unknown>, user);
    return account;
  }
}
