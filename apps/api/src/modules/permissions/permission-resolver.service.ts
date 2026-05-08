// ─── PermissionResolverService (Wave 19d) ────────────────────────────────
// The merge engine for the Salesforce-style two-layer permission model.
//
// Resolution path:
//   1. Look up the user's UserProfile (mandatory baseline).
//   2. Look up all UserPermissionSet rows that aren't expired.
//   3. Boolean-OR every flag in objectCrud + fieldPerms; set-union systemPerms.
//
// `flatten()` then projects the merged record into the legacy
// `permissions: string[]` shape (e.g. `lead.read`, `lead.amount.read`,
// `api_enabled`) so existing PermissionsGuard + @RequirePermissions calls
// keep working without change.
//
// Soft migration: if a user has no Profile yet, fall back to the legacy
// Role + RolePermission perms. Tenants migrate to Profiles at their own pace.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CrudFlags {
  read?: boolean;
  write?: boolean;
  delete?: boolean;
  create?: boolean;
}

interface FieldFlags {
  read?: boolean;
  write?: boolean;
}

export interface ResolvedPermissions {
  /** { lead: { read: true, write: false, ... }, ... } */
  objectCrud: Record<string, CrudFlags>;
  /** { "lead.amount": { read: true, write: false }, ... } */
  fieldPerms: Record<string, FieldFlags>;
  systemPerms: string[];
  /** Legacy flat array — what PermissionsGuard expects on req.user. */
  flat: string[];
  /** True when this came from the legacy Role table (no Profile assigned). */
  legacyFallback: boolean;
}

interface CacheEntry {
  value: ResolvedPermissions;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class PermissionResolverService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the effective permission set for `userId`. Cached for 60s.
   * Callers MUST invalidate after assign/revoke (`invalidate(userId)`).
   */
  async resolveForUser(userId: string): Promise<ResolvedPermissions> {
    const cached = this.cache.get(userId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;

    const value = await this.compute(userId);
    this.cache.set(userId, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  private async compute(userId: string): Promise<ResolvedPermissions> {
    // UserProfile + Profile (one-to-one). UserPermissionSets filtered by expiry.
    const [userProfile, userPermSets] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { userId },
        include: { profile: true },
      }),
      this.prisma.userPermissionSet.findMany({
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: { permissionSet: true },
      }),
    ]);

    if (!userProfile) {
      // Soft migration: no Profile yet → fall back to legacy Role perms.
      const legacy = await this.legacyRolePermissions(userId);
      return {
        objectCrud: {},
        fieldPerms: {},
        systemPerms: [],
        flat: legacy,
        legacyFallback: true,
      };
    }

    const objectCrud: Record<string, CrudFlags> = {};
    const fieldPerms: Record<string, FieldFlags> = {};
    const systemPerms = new Set<string>();

    // Profile baseline.
    this.mergeObjectCrud(objectCrud, userProfile.profile.objectCrud as Record<string, CrudFlags>);
    this.mergeFieldPerms(fieldPerms, userProfile.profile.fieldPerms as Record<string, FieldFlags>);
    for (const p of userProfile.profile.systemPerms) systemPerms.add(p);

    // Permission Sets — additive overlays.
    for (const ups of userPermSets) {
      const ps = ups.permissionSet;
      if (!ps.isActive) continue;
      this.mergeObjectCrud(objectCrud, ps.objectCrud as Record<string, CrudFlags>);
      this.mergeFieldPerms(fieldPerms, ps.fieldPerms as Record<string, FieldFlags>);
      for (const p of ps.systemPerms) systemPerms.add(p);
    }

    return {
      objectCrud,
      fieldPerms,
      systemPerms: Array.from(systemPerms),
      flat: this.flatten(objectCrud, fieldPerms, Array.from(systemPerms)),
      legacyFallback: false,
    };
  }

  /**
   * Legacy Role-based perms — used until each tenant migrates to Profile.
   */
  private async legacyRolePermissions(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const out = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.permissions) out.add(rp.permission.code);
    }
    return Array.from(out);
  }

  private mergeObjectCrud(
    target: Record<string, CrudFlags>,
    source: Record<string, CrudFlags> | null | undefined,
  ): void {
    if (!source || typeof source !== 'object') return;
    for (const [obj, flags] of Object.entries(source)) {
      if (!flags || typeof flags !== 'object') continue;
      const cur = target[obj] ?? {};
      target[obj] = {
        read: !!cur.read || !!flags.read,
        write: !!cur.write || !!flags.write,
        create: !!cur.create || !!flags.create,
        delete: !!cur.delete || !!flags.delete,
      };
    }
  }

  private mergeFieldPerms(
    target: Record<string, FieldFlags>,
    source: Record<string, FieldFlags> | null | undefined,
  ): void {
    if (!source || typeof source !== 'object') return;
    for (const [field, flags] of Object.entries(source)) {
      if (!flags || typeof flags !== 'object') continue;
      const cur = target[field] ?? {};
      target[field] = {
        read: !!cur.read || !!flags.read,
        write: !!cur.write || !!flags.write,
      };
    }
  }

  /**
   * Flatten the merged record into the legacy `string[]` shape that
   * PermissionsGuard reads via `hasPermission(granted, code)`.
   *
   * Rules:
   *   objectCrud[lead] = { read:true, write:true } → ["lead.read", "lead.write"]
   *   fieldPerms["lead.amount"] = { read:true } → ["lead.amount.read"]
   *   systemPerms ["api_enabled"] → ["api_enabled"]  (passed through verbatim)
   *
   * The "create" flag is not part of the legacy contract; we map it to
   * "<obj>.write" for backward compat. "modify_all_data" is mapped to
   * "admin.*" so it short-circuits the legacy guard.
   */
  private flatten(
    objectCrud: Record<string, CrudFlags>,
    fieldPerms: Record<string, FieldFlags>,
    systemPerms: string[],
  ): string[] {
    const out = new Set<string>();
    for (const [obj, flags] of Object.entries(objectCrud)) {
      if (flags.read) out.add(`${obj}.read`);
      if (flags.write || flags.create) out.add(`${obj}.write`);
      if (flags.delete) out.add(`${obj}.delete`);
    }
    for (const [field, flags] of Object.entries(fieldPerms)) {
      if (flags.read) out.add(`${field}.read`);
      if (flags.write) out.add(`${field}.write`);
    }
    for (const sp of systemPerms) {
      out.add(sp);
      if (sp === 'modify_all_data' || sp === 'view_all_data') out.add('admin.*');
    }
    return Array.from(out);
  }
}
