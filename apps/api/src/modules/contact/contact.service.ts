import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { IdentityResolutionService } from '../person/identity-resolution.service';
import { EmbeddingService, contactContent } from '../embeddings/embedding.service';
import { FlsService } from '../fls/fls.service';
import type { RequestUser } from '../../common/types/request-context';
import { RecycleBinService } from '../recycle-bin/recycle-bin.service';

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
    recycleBin: RecycleBinService,
    private readonly identity: IdentityResolutionService,
    private readonly fls: FlsService,
    embeddings: EmbeddingService,
  ) {
    super(workflow, validation, audit, emitter, outbox, recycleBin);
    this.embeddings = embeddings;
  }

  /** Project a Contact into the text we embed for RAG. */
  protected buildEmbeddingContent(
    objectApiName: string,
    record: Record<string, unknown>,
  ): string | null {
    if (objectApiName !== 'contact') return null;
    return contactContent({
      firstName: record['firstName'] as string | null,
      lastName: record['lastName'] as string | null,
      title: record['title'] as string | null,
      department: record['department'] as string | null,
      email: record['email'] as string | null,
      phone: record['phone'] as string | null,
      mobile: record['mobile'] as string | null,
    });
  }

  async list(tenantId: string, opts: ContactListOptions = {}, user?: RequestUser) {
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

    // Wave 16a: strip FLS-gated fields from each row.
    await this.fls.filterReadableMany(user, 'contact', data as unknown as Record<string, unknown>[]);
    return { data, total };
  }

  async get(tenantId: string, id: string, user?: RequestUser) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    // Wave 16a: strip FLS-gated fields. No-op if user not provided.
    await this.fls.filterReadable(user, 'contact', contact as unknown as Record<string, unknown>);
    return contact;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    // Wave 16a: reject writes to fields the user lacks writePermission for.
    await this.fls.assertWritable(user, 'contact', input);
    await this.beforeSave(tenantId, 'contact', input, undefined, user);
    const data = {
      ...input,
      tenantId,
      ownerId: (input['ownerId'] as string) || user.id,
    };
    const contact = await this.prisma.contact.create({ data: data as any });
    // Customer 360: resolve identity and link to canonical Person
    try {
      const resolution = await this.identity.resolve(tenantId, {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        source: 'contact',
        sourceId: contact.id,
      });
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { personId: resolution.personId },
      });
      (contact as Record<string, unknown>)['personId'] = resolution.personId;
    } catch {
      // Non-blocking
    }
    await this.afterCreate(tenantId, 'contact', contact as Record<string, unknown>, user);
    return contact;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    // Wave 16a: reject writes to fields the user lacks writePermission for.
    await this.fls.assertWritable(user, 'contact', input);
    // Internal previous-fetch — pass no user so we get the unfiltered record for diffing.
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'contact', input, previous as Record<string, unknown>, user);
    const contact = await this.prisma.contact.update({
      where: { id },
      data: { ...input, updatedAt: new Date() } as any,
    });
    await this.afterUpdate(tenantId, 'contact', contact as Record<string, unknown>, previous as Record<string, unknown>, user);
    return contact;
  }

  async softDelete(tenantId: string, id: string, user?: RequestUser) {
    const previous = await this.get(tenantId, id);
    const contact = await this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date() } as any,
    });
    await this.afterSoftDelete(tenantId, 'contact', previous as Record<string, unknown>, user);
    return contact;
  }
}
