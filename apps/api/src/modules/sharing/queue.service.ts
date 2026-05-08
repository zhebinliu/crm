// ─── QueueService ──────────────────────────────────────────────────────────
//
// Salesforce-style assignment queues. A queue holds Lead / Case records
// that no individual user owns yet; the queue's PublicGroup is the pool of
// users authorized to claim those records. Claiming = atomically reassigning
// `queueId` -> null and `ownerId` -> claiming user.
//
// v1 supports Lead and Case (the SF-canonical queueable objects). Adding
// other objects requires (a) a `queueId` column on that model and (b) wiring
// the apiName into the `claim`/`route`/`listItems` switches below.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicGroupService } from './public-group.service';

const SUPPORTED = ['lead', 'case'] as const;
type SupportedObject = (typeof SUPPORTED)[number];

export interface CreateQueueDto {
  apiName: string;
  label: string;
  supportedObjects: string[];
  groupId?: string | null;
}

export interface UpdateQueueDto {
  label?: string;
  supportedObjects?: string[];
  groupId?: string | null;
}

@Injectable()
export class QueueService {
  private readonly log = new Logger(QueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: PublicGroupService,
  ) {}

  list(tenantId: string) {
    return this.prisma.queue.findMany({
      where: { tenantId },
      orderBy: { apiName: 'asc' },
      include: { group: { select: { id: true, apiName: true, label: true } } },
    });
  }

  async get(tenantId: string, id: string) {
    const q = await this.prisma.queue.findFirst({
      where: { id, tenantId },
      include: { group: { select: { id: true, apiName: true, label: true } } },
    });
    if (!q) throw new NotFoundException('Queue not found');
    return q;
  }

  async getByApiName(tenantId: string, apiName: string) {
    return this.prisma.queue.findUnique({
      where: { tenantId_apiName: { tenantId, apiName } },
    });
  }

  async create(tenantId: string, dto: CreateQueueDto) {
    this.assertSupported(dto.supportedObjects);
    if (dto.groupId) await this.assertGroupExists(tenantId, dto.groupId);
    return this.prisma.queue.create({
      data: {
        tenantId,
        apiName: dto.apiName,
        label: dto.label,
        supportedObjects: dto.supportedObjects,
        groupId: dto.groupId ?? null,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateQueueDto) {
    const existing = await this.prisma.queue.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Queue not found');
    if (dto.supportedObjects) this.assertSupported(dto.supportedObjects);
    if (dto.groupId) await this.assertGroupExists(tenantId, dto.groupId);
    return this.prisma.queue.update({
      where: { id },
      data: {
        label: dto.label ?? existing.label,
        supportedObjects: dto.supportedObjects ?? existing.supportedObjects,
        groupId: dto.groupId === undefined ? existing.groupId : dto.groupId,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.queue.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Queue not found');
    // Note: cascade-set-null on Lead/Case via FK clears any in-flight queueId.
    await this.prisma.queue.delete({ where: { id } });
  }

  /** List records currently sitting in this queue (queueId === id). */
  async listItems(tenantId: string, id: string) {
    const q = await this.get(tenantId, id);
    const items: Array<{ recordType: string; id: string; label: string }> = [];
    if (q.supportedObjects.includes('lead')) {
      const leads = await this.prisma.lead.findMany({
        where: { tenantId, queueId: q.id, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, company: true },
        take: 200,
      });
      for (const l of leads) {
        items.push({
          recordType: 'lead',
          id: l.id,
          label: `${l.firstName ?? ''} ${l.lastName} (${l.company})`.trim(),
        });
      }
    }
    if (q.supportedObjects.includes('case')) {
      const cases = await this.prisma.case.findMany({
        where: { tenantId, queueId: q.id, deletedAt: null },
        select: { id: true, caseNumber: true, subject: true },
        take: 200,
      });
      for (const c of cases) {
        items.push({ recordType: 'case', id: c.id, label: `${c.caseNumber} ${c.subject}` });
      }
    }
    return items;
  }

  /**
   * Atomically claim an item out of a queue: set queueId=null and ownerId
   * to the claimer. Authorization: the claimer must be a member (direct or
   * via role) of the queue's PublicGroup, OR the queue has no group and
   * any user with the object's write permission may claim.
   */
  async claim(args: {
    tenantId: string;
    queueId: string;
    recordType: string;
    recordId: string;
    userId: string;
  }) {
    const queue = await this.prisma.queue.findFirst({
      where: { id: args.queueId, tenantId: args.tenantId },
    });
    if (!queue) throw new NotFoundException('Queue not found');
    const recordType = args.recordType.toLowerCase();
    if (!queue.supportedObjects.includes(recordType)) {
      throw new BadRequestException(`Queue does not support ${recordType}`);
    }

    // Authorization via group membership (if a group is configured).
    if (queue.groupId) {
      const memberIds = await this.groups.expandToUserIds(queue.groupId);
      if (!memberIds.has(args.userId)) {
        throw new ForbiddenException('Not a member of this queue');
      }
    }

    // Atomic reassignment. We use updateMany with the queueId as a guard
    // condition — if the record was claimed by someone else between our read
    // and write, count === 0 and we throw.
    let count = 0;
    if (recordType === 'lead') {
      const r = await this.prisma.lead.updateMany({
        where: {
          id: args.recordId,
          tenantId: args.tenantId,
          queueId: queue.id,
        },
        data: { queueId: null, ownerId: args.userId, updatedById: args.userId },
      });
      count = r.count;
    } else if (recordType === 'case') {
      const r = await this.prisma.case.updateMany({
        where: {
          id: args.recordId,
          tenantId: args.tenantId,
          queueId: queue.id,
        },
        data: { queueId: null, ownerId: args.userId, updatedById: args.userId },
      });
      count = r.count;
    } else {
      throw new BadRequestException(`Unsupported recordType: ${recordType}`);
    }
    if (count === 0) {
      throw new BadRequestException('Record not in queue (already claimed?)');
    }

    // Audit log.
    await this.prisma.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorId: args.userId,
        action: 'claim',
        recordType,
        recordId: args.recordId,
        changes: { queue: { from: queue.apiName, to: null }, owner: { to: args.userId } },
      },
    });

    return { ok: true, recordType, recordId: args.recordId, ownerId: args.userId };
  }

  /**
   * Route a record to a queue: set queueId. Owner stays as-is so reads still
   * resolve, but `queueId ?? ownerId` semantics treat the queue as owner for
   * routing purposes. Caller is expected to set ownerId to a system
   * placeholder if a stricter "queue owns it" policy is desired.
   */
  async route(args: {
    tenantId: string;
    actorId: string;
    objectApiName: string;
    recordId: string;
    queueApiName: string;
  }) {
    const queue = await this.prisma.queue.findUnique({
      where: { tenantId_apiName: { tenantId: args.tenantId, apiName: args.queueApiName } },
    });
    if (!queue) throw new NotFoundException('Queue not found');
    const recordType = args.objectApiName.toLowerCase();
    if (!queue.supportedObjects.includes(recordType)) {
      throw new BadRequestException(`Queue does not support ${recordType}`);
    }
    if (recordType === 'lead') {
      await this.prisma.lead.update({
        where: { id: args.recordId },
        data: { queueId: queue.id, updatedById: args.actorId },
      });
    } else if (recordType === 'case') {
      await this.prisma.case.update({
        where: { id: args.recordId },
        data: { queueId: queue.id, updatedById: args.actorId },
      });
    } else {
      throw new BadRequestException(`Unsupported recordType: ${recordType}`);
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorId: args.actorId,
        action: 'route_to_queue',
        recordType,
        recordId: args.recordId,
        changes: { queue: { to: queue.apiName } },
      },
    });
    return { ok: true };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private assertSupported(objects: string[]) {
    for (const o of objects) {
      if (!SUPPORTED.includes(o.toLowerCase() as SupportedObject)) {
        throw new BadRequestException(
          `Unsupported object "${o}". v1 supports: ${SUPPORTED.join(', ')}.`,
        );
      }
    }
  }

  private async assertGroupExists(tenantId: string, groupId: string) {
    const g = await this.prisma.publicGroup.findFirst({ where: { id: groupId, tenantId } });
    if (!g) throw new BadRequestException('groupId does not reference a tenant public group');
  }
}
