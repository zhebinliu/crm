// ─── SharingService ───────────────────────────────────────────────────────
//
// Salesforce-style record visibility model. Combines three sources:
//   1. ownerId === currentUserId           (you see your own records)
//   2. ownerId in subordinateUserIds       (role hierarchy: managers see
//                                           records owned by users whose
//                                           role is anywhere below theirs)
//   3. (recordType, recordId) is in RecordShare table for currentUserId
//                                          (explicit share)
//
// Plus an org-default rung: admin (`admin.*` permission) sees everything in
// tenant. We also short-circuit when the user's permission set includes the
// `<object>.*` wildcard or `<object>.read_all`.
//
// The exposed `whereVisible(...)` method returns a Prisma where fragment
// callers can spread into their findMany/findFirst.
//
// CACHING: per-request. We cache subordinateUserIds + sharedRecordIds in a
// short-lived in-memory map keyed by userId so a single request doing 10
// queries doesn't re-walk the role tree.

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hasPermission } from '@tokenwave/shared';
import { TerritoryService } from '../territory/territory.service';
import { OrgWideDefaultsService } from './owd.service';
import { PublicGroupService } from './public-group.service';

export interface SharingContext {
  tenantId: string;
  userId: string;
  /** Permission codes from JWT (lead.read, opportunity.*, admin.*, ...). */
  permissions: string[];
}

interface CacheEntry {
  subordinateUserIds: Set<string>;
  expires: number;
}

const CACHE_TTL_MS = 30_000;

@Injectable()
export class SharingService {
  private readonly log = new Logger(SharingService.name);
  private readonly subordinatesCache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly owd: OrgWideDefaultsService,
    private readonly groups: PublicGroupService,
    // Wave 19f: optional. If TerritoryModule is loaded (it is), this is wired
    // and visibility unions in territory-derived account access. If not, the
    // service degrades to the original owner+share logic.
    @Optional() private readonly territories?: TerritoryService,
  ) {}

  /**
   * The main API. Returns a Prisma where fragment that, when spread into a
   * findMany on a tenant-scoped object with an `ownerId` column, restricts
   * to records the user is allowed to see.
   *
   *   const where = await sharing.whereVisible(ctx, 'opportunity');
   *   prisma.opportunity.findMany({ where: { ...where, deletedAt: null } });
   */
  async whereVisible(
    ctx: SharingContext,
    recordType: string,
    opts: { ownerField?: string } = {},
  ): Promise<Record<string, unknown>> {
    const ownerField = opts.ownerField ?? 'ownerId';

    // Admin / wildcard sees everything in tenant.
    if (this.canSeeAll(ctx, recordType)) {
      return { tenantId: ctx.tenantId };
    }

    // OWD baseline. When unset, defaults to public_read_write (legacy behavior).
    const owd = await this.owd.get(ctx.tenantId, recordType);
    if (
      owd.internalSharing === 'public_read_write' ||
      owd.internalSharing === 'public_read'
    ) {
      // Both internal sharing levels allow tenant-wide VISIBILITY; the
      // read-vs-edit distinction is enforced by callers using
      // OrgWideDefaultsService.evaluateAccess() at write time.
      return { tenantId: ctx.tenantId };
    }

    // private: only owner + role-hierarchy + RecordShare (direct user OR via
    // PublicGroup membership).
    const subordinateIds = owd.grantHierarchy
      ? await this.subordinateUserIds(ctx.tenantId, ctx.userId)
      : new Set<string>();
    const sharedIds = await this.sharedRecordIds(ctx.tenantId, ctx.userId, recordType);

    const visibleOwnerIds = new Set<string>([ctx.userId, ...subordinateIds]);

    const branches: Record<string, unknown>[] = [
      { tenantId: ctx.tenantId, [ownerField]: { in: Array.from(visibleOwnerIds) } },
    ];
    if (sharedIds.length > 0) {
      branches.push({ tenantId: ctx.tenantId, id: { in: sharedIds } });
    }

    // Wave 19f: territory-derived visibility. Strictly additive — anything
    // already visible stays visible.
    //   recordType === 'account'              → id IN (territoryAccounts)
    //   recordType IN {opportunity,quote,...} → accountId IN (territoryAccounts)
    if (this.territories) {
      const territoryAccountIds = await this.territories.accountsForUser(ctx.userId);
      if (territoryAccountIds.size > 0) {
        const ids = Array.from(territoryAccountIds);
        if (recordType === 'account') {
          branches.push({ tenantId: ctx.tenantId, id: { in: ids } });
        } else if (
          recordType === 'opportunity' ||
          recordType === 'quote' ||
          recordType === 'order' ||
          recordType === 'contract' ||
          recordType === 'contact' ||
          recordType === 'case'
        ) {
          branches.push({ tenantId: ctx.tenantId, accountId: { in: ids } });
        }
      }
    }

    return { OR: branches };
  }

  /**
   * Single-record visibility check used by detail-page authorize hooks.
   * Returns true if `userId` can see `recordType:recordId` in this tenant.
   */
  async canSee(
    ctx: SharingContext,
    recordType: string,
    recordId: string,
    ownerId: string | null,
  ): Promise<boolean> {
    if (this.canSeeAll(ctx, recordType)) return true;
    if (ownerId === ctx.userId) return true;
    // OWD baseline: when not strictly private, everyone in tenant sees it.
    const owd = await this.owd.get(ctx.tenantId, recordType);
    if (
      owd.internalSharing === 'public_read_write' ||
      owd.internalSharing === 'public_read'
    ) {
      return true;
    }
    if (owd.grantHierarchy && ownerId) {
      const subs = await this.subordinateUserIds(ctx.tenantId, ctx.userId);
      if (subs.has(ownerId)) return true;
    }
    const shared = await this.sharedRecordIds(ctx.tenantId, ctx.userId, recordType);
    if (shared.includes(recordId)) return true;
    // Wave 19f: territory access for account-anchored objects.
    if (this.territories && recordType === 'account') {
      const ids = await this.territories.accountsForUser(ctx.userId);
      if (ids.has(recordId)) return true;
    }
    return false;
  }

  /**
   * Manually share a record. Grantee is either a user OR a PublicGroup —
   * exactly one of `granteeUserId` / `granteeGroupId` must be set
   * (enforced here at the service layer; the schema's compound unique
   * key allows but doesn't require this).
   */
  async shareRecord(args: {
    tenantId: string;
    actorId: string;
    recordType: string;
    recordId: string;
    granteeUserId?: string | null;
    granteeGroupId?: string | null;
    accessLevel?: 'READ' | 'EDIT';
    reason?: string;
  }) {
    const userId = args.granteeUserId ?? null;
    const groupId = args.granteeGroupId ?? null;
    if (!userId && !groupId) {
      throw new Error('shareRecord: granteeUserId OR granteeGroupId is required');
    }
    if (userId && groupId) {
      throw new Error('shareRecord: provide exactly one of granteeUserId / granteeGroupId');
    }
    // Find existing share row; we can't use the compound unique because one
    // of (userId, groupId) is always null which Prisma can't index on.
    const existing = await this.prisma.recordShare.findFirst({
      where: {
        tenantId: args.tenantId,
        recordType: args.recordType,
        recordId: args.recordId,
        userId,
        groupId,
      },
    });
    if (existing) {
      return this.prisma.recordShare.update({
        where: { id: existing.id },
        data: {
          accessLevel: args.accessLevel ?? 'READ',
          reason: args.reason ?? 'manual',
        },
      });
    }
    return this.prisma.recordShare.create({
      data: {
        tenantId: args.tenantId,
        recordType: args.recordType,
        recordId: args.recordId,
        userId,
        groupId,
        accessLevel: args.accessLevel ?? 'READ',
        reason: args.reason ?? 'manual',
        createdById: args.actorId,
      },
    });
  }

  async revokeShare(
    tenantId: string,
    recordType: string,
    recordId: string,
    granteeUserId?: string | null,
    granteeGroupId?: string | null,
  ) {
    await this.prisma.recordShare.deleteMany({
      where: {
        tenantId,
        recordType,
        recordId,
        userId: granteeUserId ?? null,
        groupId: granteeGroupId ?? null,
      },
    });
  }

  /** List all explicit shares on a single record (user or group grantee). */
  listSharesForRecord(tenantId: string, recordType: string, recordId: string) {
    return this.prisma.recordShare.findMany({
      where: { tenantId, recordType, recordId },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        group: { select: { id: true, apiName: true, label: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private canSeeAll(ctx: SharingContext, recordType: string): boolean {
    if (hasPermission(ctx.permissions, 'admin.*')) return true;
    // `<object>.*` implies see-all on that object too. Keep this conservative —
    // many SF orgs distinguish "modify all" from "view all", we conflate.
    if (ctx.permissions.includes(`${recordType}.*`)) return true;
    return false;
  }

  /** Walk the role hierarchy: every user in a role at or below mine. */
  private async subordinateUserIds(tenantId: string, userId: string): Promise<Set<string>> {
    const cached = this.subordinatesCache.get(`${tenantId}:${userId}`);
    if (cached && cached.expires > Date.now()) return cached.subordinateUserIds;

    // Get the user's roles
    const myRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    if (myRoles.length === 0) {
      const empty = new Set<string>();
      this.subordinatesCache.set(`${tenantId}:${userId}`, {
        subordinateUserIds: empty, expires: Date.now() + CACHE_TTL_MS,
      });
      return empty;
    }

    // Traverse children-of-children using BFS (cap at depth 16 to avoid cycles).
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
        for (const child of childMap.get(rid) ?? []) next.push(child);
      }
      if (next.length === 0) break;
      queue.length = 0;
      queue.push(...next);
      depth += 1;
    }

    // Drop the user's own roles — those don't grant subordinate visibility,
    // they're peers. (My peer's records are NOT mine to see by hierarchy.)
    for (const r of myRoles) visited.delete(r.roleId);

    if (visited.size === 0) {
      const empty = new Set<string>();
      this.subordinatesCache.set(`${tenantId}:${userId}`, {
        subordinateUserIds: empty, expires: Date.now() + CACHE_TTL_MS,
      });
      return empty;
    }

    // All users in those roles
    const subordinates = await this.prisma.userRole.findMany({
      where: { roleId: { in: Array.from(visited) } },
      select: { userId: true },
    });
    const ids = new Set(subordinates.map((u) => u.userId));
    ids.delete(userId); // safety: never grant self via hierarchy round-trip

    this.subordinatesCache.set(`${tenantId}:${userId}`, {
      subordinateUserIds: ids, expires: Date.now() + CACHE_TTL_MS,
    });
    return ids;
  }

  private async sharedRecordIds(tenantId: string, userId: string, recordType: string): Promise<string[]> {
    // Direct user shares...
    const direct = await this.prisma.recordShare.findMany({
      where: { tenantId, userId, recordType },
      select: { recordId: true },
      take: 5000,
    });
    // ...plus shares granted to any PublicGroup the user belongs to.
    const groupIds = await this.groups.groupsForUser(tenantId, userId);
    let viaGroup: { recordId: string }[] = [];
    if (groupIds.length > 0) {
      viaGroup = await this.prisma.recordShare.findMany({
        where: { tenantId, recordType, groupId: { in: groupIds } },
        select: { recordId: true },
        take: 5000,
      });
    }
    const out = new Set<string>([...direct.map((s) => s.recordId), ...viaGroup.map((s) => s.recordId)]);
    return Array.from(out);
  }
}
