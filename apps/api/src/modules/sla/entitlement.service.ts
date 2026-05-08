// ─── EntitlementService ─────────────────────────────────────────────────
// CRUD over Entitlement rows. Entitlements link an Account/Contact to a
// SlaPolicy with a contracted period (startsAt..endsAt) and a tier.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, opts: { accountId?: string; contactId?: string; status?: string } = {}) {
    const { accountId, contactId, status } = opts;
    return this.prisma.entitlement.findMany({
      where: {
        tenantId,
        ...(accountId ? { accountId } : {}),
        ...(contactId ? { contactId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { startsAt: 'desc' },
      include: { slaPolicy: { select: { id: true, apiName: true, label: true } } },
    });
  }

  async get(tenantId: string, id: string) {
    const e = await this.prisma.entitlement.findFirst({
      where: { id, tenantId },
      include: { slaPolicy: true },
    });
    if (!e) throw new NotFoundException(`Entitlement ${id} not found`);
    return e;
  }

  async create(tenantId: string, input: Record<string, unknown>) {
    return this.prisma.entitlement.create({
      data: {
        tenantId,
        accountId: (input.accountId as string | null) ?? null,
        contactId: (input.contactId as string | null) ?? null,
        slaPolicyId: input.slaPolicyId as string,
        startsAt: new Date(input.startsAt as string),
        endsAt: new Date(input.endsAt as string),
        status: (input.status as string) ?? 'active',
        tier: (input.tier as string | null) ?? null,
      },
    });
  }

  async update(tenantId: string, id: string, input: Record<string, unknown>) {
    await this.get(tenantId, id);
    const data: Record<string, unknown> = {};
    for (const key of ['accountId', 'contactId', 'slaPolicyId', 'status', 'tier']) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    if (input['startsAt']) data['startsAt'] = new Date(input['startsAt'] as string);
    if (input['endsAt']) data['endsAt'] = new Date(input['endsAt'] as string);
    return this.prisma.entitlement.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.entitlement.delete({ where: { id } });
  }

  async findActiveForAccount(tenantId: string, accountId: string) {
    const now = new Date();
    return this.prisma.entitlement.findFirst({
      where: {
        tenantId, accountId, status: 'active',
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: { slaPolicy: true },
      orderBy: { startsAt: 'desc' },
    });
  }
}
