import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseEntityService } from '../../common/base-entity.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ValidationRuleService } from '../workflow/validation-rule.service';
import { AuditService } from '../workflow/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { IdentityResolutionService } from '../person/identity-resolution.service';
import { EVENTS } from '@tokenwave/shared';
import { FlsService } from '../fls/fls.service';
import type { RequestUser } from '../../common/types/request-context';
import { RecycleBinService } from '../recycle-bin/recycle-bin.service';

export interface LeadListOptions {
  search?: string;
  status?: string;
  ownerId?: string;
  isConverted?: boolean;
  skip?: number;
  take?: number;
}

export interface ConvertLeadInput {
  accountName?: string;
  existingAccountId?: string;
  contactInput?: Record<string, unknown>;
  opportunityInput?: Record<string, unknown>;
  doNotCreateOpp?: boolean;
}

@Injectable()
export class LeadService extends BaseEntityService {
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
  ) {
    super(workflow, validation, audit, emitter, outbox, recycleBin);
  }

  async list(tenantId: string, opts: LeadListOptions = {}, user?: RequestUser) {
    const { search, status, ownerId, isConverted, skip = 0, take = 20 } = opts;

    const where = {
      tenantId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(isConverted !== undefined ? { isConverted } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { company: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.lead.count({ where }),
    ]);

    // Wave 16a: strip FLS-gated fields from each row.
    await this.fls.filterReadableMany(user, 'lead', data as unknown as Record<string, unknown>[]);
    return { data, total };
  }

  async get(tenantId: string, id: string, user?: RequestUser) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    // Wave 16a: strip FLS-gated fields. No-op if user not provided.
    await this.fls.filterReadable(user, 'lead', lead as unknown as Record<string, unknown>);
    return lead;
  }

  async create(tenantId: string, input: Record<string, unknown>, user: RequestUser) {
    // Wave 16a: reject writes to fields the user lacks writePermission for.
    await this.fls.assertWritable(user, 'lead', input);
    await this.beforeSave(tenantId, 'lead', input, undefined, user);
    const data = {
      ...input,
      tenantId,
      ownerId: (input['ownerId'] as string) || user.id,
    };
    const lead = await this.prisma.lead.create({ data: data as any });
    // Customer 360: resolve identity and link to canonical Person
    try {
      const resolution = await this.identity.resolve(tenantId, {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        mobile: lead.mobile,
        source: 'lead',
        sourceId: lead.id,
      });
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { personId: resolution.personId },
      });
      (lead as Record<string, unknown>)['personId'] = resolution.personId;
    } catch (e) {
      // Identity resolution failures shouldn't block lead creation
      // (the row still exists, it just lacks a Person link until reconcile)
    }
    await this.afterCreate(tenantId, 'lead', lead as Record<string, unknown>, user);
    return lead;
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>, user: RequestUser) {
    // Wave 16a: reject writes to fields the user lacks writePermission for.
    await this.fls.assertWritable(user, 'lead', input);
    // Internal previous-fetch — pass no user so we get the unfiltered record for diffing.
    const previous = await this.get(tenantId, id);
    await this.beforeSave(tenantId, 'lead', input, previous as Record<string, unknown>, user);
    const lead = await this.prisma.lead.update({
      where: { id },
      data: { ...input, updatedAt: new Date() } as any,
    });
    await this.afterUpdate(tenantId, 'lead', lead as Record<string, unknown>, previous as Record<string, unknown>, user);
    return lead;
  }

  async convert(tenantId: string, id: string, input: ConvertLeadInput, user: RequestUser) {
    const lead = await this.get(tenantId, id);

    const result = await this.prisma.$transaction(async (tx) => {
      // Resolve or create Account
      let accountId: string;
      if (input.existingAccountId) {
        accountId = input.existingAccountId;
      } else {
        const account = await tx.account.create({
          data: {
            tenantId,
            name: input.accountName ?? `${(lead as any).company ?? 'Unnamed Account'}`,
            ownerId: (lead as any).ownerId,
            ...((input.contactInput as any)?.accountData ?? {}),
          } as any,
        });
        accountId = account.id;
      }

      // Create Contact
      const contactData = input.contactInput ?? {};
      const contact = await tx.contact.create({
        data: {
          tenantId,
          accountId,
          firstName: (lead as any).firstName,
          lastName: (lead as any).lastName,
          email: (lead as any).email,
          phone: (lead as any).phone,
          ownerId: (lead as any).ownerId,
          ...contactData,
        } as any,
      });

      // Optionally create Opportunity
      let opportunityId: string | null = null;
      if (!input.doNotCreateOpp) {
        const opp = await tx.opportunity.create({
          data: {
            tenantId,
            accountId,
            name: `${(lead as any).firstName ?? ''} ${(lead as any).lastName ?? ''} - Opportunity`.trim(),
            ownerId: (lead as any).ownerId,
            stage: 'Prospecting',
            closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
            ...(input.opportunityInput ?? {}),
          } as any,
        });
        opportunityId = opp.id;
      }

      // Mark lead as converted
      const convertedLead = await tx.lead.update({
        where: { id },
        data: {
          isConverted: true,
          convertedAt: new Date(),
          convertedAccountId: accountId,
          convertedContactId: contact.id,
          convertedOppId: opportunityId,
        } as any,
      });

      return { lead: convertedLead, accountId, contactId: contact.id, opportunityId };
    });

    await this.outbox.emit(tenantId, EVENTS.LEAD_CONVERTED, 'lead', id, result);
    this.emitter.emit(EVENTS.LEAD_CONVERTED, { tenantId, ...result });

    return result;
  }

  async softDelete(tenantId: string, id: string, user?: RequestUser) {
    const previous = await this.get(tenantId, id);
    const lead = await this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() } as any,
    });
    await this.afterSoftDelete(tenantId, 'lead', previous as Record<string, unknown>, user);
    return lead;
  }
}
