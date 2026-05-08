// ─── ProfileService (Wave 19d) ────────────────────────────────────────────
// CRUD over Profile + assignToUser. Also responsible for seeding the
// default profiles for every tenant on boot:
//   • system_administrator   — full admin.* + modify_all_data
//   • standard_user          — read+write on the LTC objects, no admin
//   • minimum_access_user    — login only, no object access
//
// `assignToUser` is an upsert — a user can have at most one Profile, and
// reassigning replaces the previous mapping atomically.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionResolverService } from './permission-resolver.service';

interface CrudFlags {
  read?: boolean;
  write?: boolean;
  create?: boolean;
  delete?: boolean;
}

export interface ProfileInput {
  apiName: string;
  label: string;
  description?: string;
  objectCrud?: Record<string, CrudFlags>;
  fieldPerms?: Record<string, { read?: boolean; write?: boolean }>;
  systemPerms?: string[];
}

const DEFAULT_PROFILES: Array<
  ProfileInput & { isSystem: true }
> = [
  {
    apiName: 'system_administrator',
    label: 'System Administrator',
    description: 'Full access to every object, field, and admin function.',
    objectCrud: {},
    fieldPerms: {},
    systemPerms: ['modify_all_data', 'view_all_data', 'api_enabled', 'admin_console'],
    isSystem: true,
  },
  {
    apiName: 'standard_user',
    label: 'Standard User',
    description: 'Read + write on core LTC objects. No admin access.',
    objectCrud: {
      lead: { read: true, write: true, create: true },
      account: { read: true, write: true, create: true },
      contact: { read: true, write: true, create: true },
      opportunity: { read: true, write: true, create: true },
      activity: { read: true, write: true, create: true },
    },
    fieldPerms: {},
    systemPerms: ['api_enabled'],
    isSystem: true,
  },
  {
    apiName: 'minimum_access_user',
    label: 'Minimum Access User',
    description: 'Login only. No object access; permission sets must grant everything.',
    objectCrud: {},
    fieldPerms: {},
    systemPerms: [],
    isSystem: true,
  },
];

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PermissionResolverService,
  ) {}

  list(tenantId: string) {
    return this.prisma.profile.findMany({
      where: { tenantId },
      orderBy: [{ isSystem: 'desc' }, { apiName: 'asc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const p = await this.prisma.profile.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Profile not found' });
    return p;
  }

  async create(tenantId: string, input: ProfileInput) {
    const dupe = await this.prisma.profile.findUnique({
      where: { tenantId_apiName: { tenantId, apiName: input.apiName } },
    });
    if (dupe) throw new BadRequestException({ code: 'CONFLICT', message: 'Profile apiName already exists' });
    return this.prisma.profile.create({
      data: {
        tenantId,
        apiName: input.apiName,
        label: input.label,
        description: input.description,
        objectCrud: (input.objectCrud ?? {}) as object,
        fieldPerms: (input.fieldPerms ?? {}) as object,
        systemPerms: input.systemPerms ?? [],
      },
    });
  }

  async update(tenantId: string, id: string, patch: Partial<ProfileInput>) {
    const p = await this.get(tenantId, id);
    if (p.isSystem && patch.apiName && patch.apiName !== p.apiName) {
      throw new BadRequestException({ code: 'CONFLICT', message: 'Cannot rename system profile' });
    }
    const updated = await this.prisma.profile.update({
      where: { id },
      data: {
        label: patch.label ?? p.label,
        description: patch.description ?? p.description,
        objectCrud: (patch.objectCrud ?? (p.objectCrud as object)) as object,
        fieldPerms: (patch.fieldPerms ?? (p.fieldPerms as object)) as object,
        systemPerms: patch.systemPerms ?? p.systemPerms,
      },
    });
    // Invalidate caches for every user assigned to this profile.
    const assigned = await this.prisma.userProfile.findMany({
      where: { profileId: id },
      select: { userId: true },
    });
    for (const a of assigned) this.resolver.invalidate(a.userId);
    return updated;
  }

  async remove(tenantId: string, id: string) {
    const p = await this.get(tenantId, id);
    if (p.isSystem) {
      throw new BadRequestException({ code: 'CONFLICT', message: 'Cannot delete system profile' });
    }
    const inUse = await this.prisma.userProfile.count({ where: { profileId: id } });
    if (inUse > 0) {
      throw new BadRequestException({
        code: 'CONFLICT',
        message: `Profile is assigned to ${inUse} user(s). Reassign them first.`,
      });
    }
    await this.prisma.profile.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Upsert the user → profile mapping (each user has at most one Profile).
   * Caller is responsible for invalidating the resolver cache, which we
   * do here as well for safety.
   */
  async assignToUser(tenantId: string, userId: string, profileId: string) {
    // Tenant cross-check: Profile + User must both belong to `tenantId`.
    const [profile, user] = await Promise.all([
      this.prisma.profile.findFirst({ where: { id: profileId, tenantId } }),
      this.prisma.user.findFirst({ where: { id: userId, tenantId } }),
    ]);
    if (!profile) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Profile not found' });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });

    const result = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, profileId },
      update: { profileId, assignedAt: new Date() },
    });
    this.resolver.invalidate(userId);
    return result;
  }

  /**
   * Idempotent default-profile seeder. Called from PermissionsModule on
   * boot. Skips tenants that already have at least one profile.
   */
  async seedDefaults(tenantId: string): Promise<void> {
    const existing = await this.prisma.profile.count({ where: { tenantId } });
    if (existing > 0) return;
    for (const p of DEFAULT_PROFILES) {
      await this.prisma.profile.create({
        data: {
          tenantId,
          apiName: p.apiName,
          label: p.label,
          description: p.description,
          objectCrud: (p.objectCrud ?? {}) as object,
          fieldPerms: (p.fieldPerms ?? {}) as object,
          systemPerms: p.systemPerms ?? [],
          isSystem: true,
        },
      });
    }
  }
}
