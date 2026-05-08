// ─── OrgWideDefaultsService ────────────────────────────────────────────────
//
// Salesforce-style Org-Wide Defaults: per-object baseline visibility for the
// tenant. Three settings:
//   - "private"             — only owner + role-hierarchy + RecordShare see it
//   - "public_read"         — everyone in tenant can READ; only the above
//                             rungs grant EDIT
//   - "public_read_write"   — everyone in tenant can READ + EDIT (legacy
//                             behavior; the implicit default when no row
//                             exists, for backwards compatibility)
//
// `evaluateAccess(...)` is the composite read used by SharingService /
// detail-page authorize hooks: returns the highest level of access the user
// gets across OWD baseline + role hierarchy + explicit RecordShare.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hasPermission } from '@tokenwave/shared';

export type InternalSharing = 'private' | 'public_read' | 'public_read_write';
export type AccessLevel = 'none' | 'read' | 'edit';

export interface OrgWideDefaultDto {
  internalSharing: InternalSharing;
  externalSharing?: string | null;
  grantHierarchy: boolean;
}

export interface ResolvedOwd {
  objectApiName: string;
  internalSharing: InternalSharing;
  externalSharing: string | null;
  grantHierarchy: boolean;
  /** True when this row was synthesized from defaults (no DB row). */
  isDefault: boolean;
}

interface AccessCtx {
  tenantId: string;
  userId: string;
  permissions: string[];
}

@Injectable()
export class OrgWideDefaultsService {
  private readonly log = new Logger(OrgWideDefaultsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** List every per-object OWD configured for the tenant. */
  async list(tenantId: string) {
    return this.prisma.orgWideDefault.findMany({
      where: { tenantId },
      orderBy: { objectApiName: 'asc' },
    });
  }

  /**
   * Get the OWD for one object, falling back to the legacy default
   * `public_read_write` + `grantHierarchy=true` when no row exists. This
   * preserves pre-Wave-19c behavior for tenants that never opted into OWD.
   */
  async get(tenantId: string, objectApiName: string): Promise<ResolvedOwd> {
    const row = await this.prisma.orgWideDefault.findUnique({
      where: { tenantId_objectApiName: { tenantId, objectApiName } },
    });
    if (!row) {
      return {
        objectApiName,
        internalSharing: 'public_read_write',
        externalSharing: null,
        grantHierarchy: true,
        isDefault: true,
      };
    }
    return {
      objectApiName: row.objectApiName,
      internalSharing: this.normalize(row.internalSharing),
      externalSharing: row.externalSharing ?? null,
      grantHierarchy: row.grantHierarchy,
      isDefault: false,
    };
  }

  /** Upsert OWD for a given object. */
  async set(tenantId: string, objectApiName: string, dto: OrgWideDefaultDto) {
    const internalSharing = this.normalize(dto.internalSharing);
    return this.prisma.orgWideDefault.upsert({
      where: { tenantId_objectApiName: { tenantId, objectApiName } },
      update: {
        internalSharing,
        externalSharing: dto.externalSharing ?? null,
        grantHierarchy: dto.grantHierarchy,
      },
      create: {
        tenantId,
        objectApiName,
        internalSharing,
        externalSharing: dto.externalSharing ?? null,
        grantHierarchy: dto.grantHierarchy,
      },
    });
  }

  /**
   * Composite per-record access check.
   *
   * Returns the highest level the user has on (objectApiName, ownerId):
   *   - "edit" if owner / has role hierarchy / has EDIT RecordShare /
   *           OWD === public_read_write / has admin
   *   - "read" if OWD === public_read / has READ RecordShare
   *   - "none" otherwise
   *
   * `recordId` is optional — if provided, RecordShare lookups are scoped to
   * that record. If omitted, we don't consider explicit shares (which only
   * make sense for a specific record).
   */
  async evaluateAccess(
    ctx: AccessCtx,
    objectApiName: string,
    ownerId: string | null,
    recordId?: string,
  ): Promise<AccessLevel> {
    // Admin / object wildcard always edits.
    if (hasPermission(ctx.permissions, 'admin.*')) return 'edit';
    if (ctx.permissions.includes(`${objectApiName}.*`)) return 'edit';

    const owd = await this.get(ctx.tenantId, objectApiName);

    // Owner always edits (subject to OWD private/public — owner is always
    // owner of their own row).
    if (ownerId && ownerId === ctx.userId) return 'edit';

    // OWD baseline. public_read_write → everyone edits; public_read → read
    // floor (RecordShare/hierarchy can promote to edit).
    let best: AccessLevel = 'none';
    if (owd.internalSharing === 'public_read_write') best = 'edit';
    else if (owd.internalSharing === 'public_read') best = 'read';

    // Role hierarchy (only if the OWD allows grant-by-hierarchy).
    if (owd.grantHierarchy && ownerId) {
      const subs = await this.subordinateUserIds(ctx.tenantId, ctx.userId);
      if (subs.has(ownerId)) {
        // Hierarchy gives the manager full access to subordinates' records.
        return 'edit';
      }
    }

    // RecordShare lookup (direct user share OR via PublicGroup membership).
    if (recordId) {
      const groupIds = await this.userGroupIds(ctx.tenantId, ctx.userId);
      const share = await this.prisma.recordShare.findFirst({
        where: {
          tenantId: ctx.tenantId,
          recordType: objectApiName,
          recordId,
          OR: [
            { userId: ctx.userId },
            ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
          ],
        },
        orderBy: { accessLevel: 'desc' }, // EDIT > READ alphabetically
      });
      if (share) {
        if (share.accessLevel === 'EDIT') return 'edit';
        if (best === 'none') best = 'read';
      }
    }

    return best;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private normalize(s: string): InternalSharing {
    if (s === 'private' || s === 'public_read' || s === 'public_read_write') return s;
    return 'public_read_write';
  }

  /**
   * Walk role hierarchy → set of subordinate user IDs. Mirrors the algorithm
   * in SharingService; duplicated here to keep OWD self-contained for the
   * single-record evaluation path. Heavy callers should prefer the cached
   * version on SharingService.
   */
  private async subordinateUserIds(tenantId: string, userId: string): Promise<Set<string>> {
    const myRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    if (myRoles.length === 0) return new Set();

    const allRoles = await this.prisma.role.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });
    const childMap = new Map<string, string[]>();
    for (const r of allRoles) {
      if (!r.parentId) continue;
      const list = childMap.get(r.parentId) ?? [];
      list.push(r.id);
      childMap.set(r.parentId, list);
    }
    const visited = new Set<string>();
    const queue: string[] = myRoles.map((r) => r.roleId);
    let depth = 0;
    while (queue.length > 0 && depth < 16) {
      const next: string[] = [];
      for (const rid of queue) {
        if (visited.has(rid)) continue;
        visited.add(rid);
        for (const c of childMap.get(rid) ?? []) next.push(c);
      }
      if (next.length === 0) break;
      queue.length = 0;
      queue.push(...next);
      depth += 1;
    }
    for (const r of myRoles) visited.delete(r.roleId);
    if (visited.size === 0) return new Set();

    const subs = await this.prisma.userRole.findMany({
      where: { roleId: { in: Array.from(visited) } },
      select: { userId: true },
    });
    const out = new Set(subs.map((u) => u.userId));
    out.delete(userId);
    return out;
  }

  /** All PublicGroup IDs the user is a (direct or via-role) member of. */
  private async userGroupIds(tenantId: string, userId: string): Promise<string[]> {
    // direct
    const direct = await this.prisma.publicGroupMember.findMany({
      where: {
        userId,
        group: { tenantId, isActive: true },
      },
      select: { groupId: true },
    });
    // via role
    const roles = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    const roleIds = roles.map((r) => r.roleId);
    let viaRole: { groupId: string }[] = [];
    if (roleIds.length > 0) {
      viaRole = await this.prisma.publicGroupMember.findMany({
        where: {
          roleId: { in: roleIds },
          group: { tenantId, isActive: true },
        },
        select: { groupId: true },
      });
    }
    const ids = new Set<string>([...direct.map((m) => m.groupId), ...viaRole.map((m) => m.groupId)]);
    return Array.from(ids);
  }
}
