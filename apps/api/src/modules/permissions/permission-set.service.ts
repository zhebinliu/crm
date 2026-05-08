// ─── PermissionSetService (Wave 19d) ────────────────────────────────────
// CRUD over PermissionSet + assignToUser/revokeFromUser. Permission Sets
// are additive overlays on top of a user's Profile baseline. A user can
// have any number of them, optionally with an expiresAt for time-boxed
// elevation (e.g. "EU GDPR officer for the next 90 days").

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionResolverService } from './permission-resolver.service';

interface CrudFlags {
  read?: boolean;
  write?: boolean;
  create?: boolean;
  delete?: boolean;
}

export interface PermissionSetInput {
  apiName: string;
  label: string;
  description?: string;
  objectCrud?: Record<string, CrudFlags>;
  fieldPerms?: Record<string, { read?: boolean; write?: boolean }>;
  systemPerms?: string[];
  isActive?: boolean;
}

@Injectable()
export class PermissionSetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PermissionResolverService,
  ) {}

  list(tenantId: string) {
    return this.prisma.permissionSet.findMany({
      where: { tenantId },
      orderBy: { apiName: 'asc' },
    });
  }

  async get(tenantId: string, id: string) {
    const p = await this.prisma.permissionSet.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Permission set not found' });
    return p;
  }

  async create(tenantId: string, input: PermissionSetInput) {
    const dupe = await this.prisma.permissionSet.findUnique({
      where: { tenantId_apiName: { tenantId, apiName: input.apiName } },
    });
    if (dupe) {
      throw new BadRequestException({ code: 'CONFLICT', message: 'Permission set apiName already exists' });
    }
    return this.prisma.permissionSet.create({
      data: {
        tenantId,
        apiName: input.apiName,
        label: input.label,
        description: input.description,
        objectCrud: (input.objectCrud ?? {}) as object,
        fieldPerms: (input.fieldPerms ?? {}) as object,
        systemPerms: input.systemPerms ?? [],
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, patch: Partial<PermissionSetInput>) {
    const p = await this.get(tenantId, id);
    const updated = await this.prisma.permissionSet.update({
      where: { id },
      data: {
        label: patch.label ?? p.label,
        description: patch.description ?? p.description,
        objectCrud: (patch.objectCrud ?? (p.objectCrud as object)) as object,
        fieldPerms: (patch.fieldPerms ?? (p.fieldPerms as object)) as object,
        systemPerms: patch.systemPerms ?? p.systemPerms,
        isActive: patch.isActive ?? p.isActive,
      },
    });
    const assigned = await this.prisma.userPermissionSet.findMany({
      where: { permissionSetId: id },
      select: { userId: true },
    });
    for (const a of assigned) this.resolver.invalidate(a.userId);
    return updated;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    const assigned = await this.prisma.userPermissionSet.findMany({
      where: { permissionSetId: id },
      select: { userId: true },
    });
    await this.prisma.permissionSet.delete({ where: { id } });
    for (const a of assigned) this.resolver.invalidate(a.userId);
    return { ok: true };
  }

  async assignToUser(
    tenantId: string,
    userId: string,
    permissionSetId: string,
    options: { expiresAt?: Date | null; assignedById?: string | null } = {},
  ) {
    const [ps, user] = await Promise.all([
      this.prisma.permissionSet.findFirst({ where: { id: permissionSetId, tenantId } }),
      this.prisma.user.findFirst({ where: { id: userId, tenantId } }),
    ]);
    if (!ps) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Permission set not found' });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });

    const result = await this.prisma.userPermissionSet.upsert({
      where: { userId_permissionSetId: { userId, permissionSetId } },
      create: {
        userId,
        permissionSetId,
        expiresAt: options.expiresAt ?? null,
        assignedById: options.assignedById ?? null,
      },
      update: {
        expiresAt: options.expiresAt ?? null,
        assignedById: options.assignedById ?? null,
        assignedAt: new Date(),
      },
    });
    this.resolver.invalidate(userId);
    return result;
  }

  async revokeFromUser(tenantId: string, userId: string, permissionSetId: string) {
    const ps = await this.prisma.permissionSet.findFirst({ where: { id: permissionSetId, tenantId } });
    if (!ps) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Permission set not found' });
    await this.prisma.userPermissionSet.deleteMany({
      where: { userId, permissionSetId },
    });
    this.resolver.invalidate(userId);
    return { ok: true };
  }
}
