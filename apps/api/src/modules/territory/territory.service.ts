// ─── TerritoryService ────────────────────────────────────────────────────
// SF-style hierarchical territory management (Wave 19f).
//
// Territories are tenant-scoped, can have a parent, and an Account can be
// assigned to many territories at once (one of which is `isPrimary`). The
// service supports:
//   - CRUD over Territory / UserTerritory / AccountTerritory / Rule
//   - Tree expansion (`getDescendants`) capped at depth 16 to defend against
//     cycles a misconfigured tenant could create
//   - `accountsForUser` — the union of accounts in any territory the user is
//     a member of (including descendants). Drives sharing visibility.
//
// Manual assignments (source = "manual") are sticky: the assignment-rule
// engine never removes them; only the explicit `unassignAccount` call does.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateTerritoryInput {
  apiName: string;
  label: string;
  description?: string;
  parentId?: string | null;
  type?: string;
  isActive?: boolean;
}

export interface UpdateTerritoryInput {
  label?: string;
  description?: string | null;
  parentId?: string | null;
  type?: string;
  isActive?: boolean;
}

export interface AssignUserInput {
  userId: string;
  roleInTerritory?: string;
  isPrimary?: boolean;
}

export interface CreateRuleInput {
  name: string;
  description?: string;
  conditions: unknown;
  matchType?: 'all' | 'any';
  priority?: number;
  isActive?: boolean;
}

export interface UpdateRuleInput {
  name?: string;
  description?: string | null;
  conditions?: unknown;
  matchType?: 'all' | 'any';
  priority?: number;
  isActive?: boolean;
}

export interface AssignAccountOpts {
  source?: 'auto' | 'manual' | 'inherited';
  isPrimary?: boolean;
}

const MAX_TREE_DEPTH = 16;

@Injectable()
export class TerritoryService {
  private readonly log = new Logger(TerritoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Territory CRUD ─────────────────────────────────────────────────────────

  async listTerritories(tenantId: string) {
    return this.prisma.territory.findMany({
      where: { tenantId },
      orderBy: [{ parentId: 'asc' }, { label: 'asc' }],
      include: {
        _count: {
          select: { members: true, accounts: true, rules: true, children: true },
        },
      },
    });
  }

  async getTerritory(tenantId: string, id: string) {
    const t = await this.prisma.territory.findFirst({
      where: { id, tenantId },
      include: {
        members: { include: { user: { select: { id: true, displayName: true, email: true } } } },
        rules: { orderBy: { priority: 'asc' } },
      },
    });
    if (!t) throw new NotFoundException(`Territory ${id} not found`);
    return t;
  }

  async createTerritory(tenantId: string, input: CreateTerritoryInput) {
    if (input.parentId) await this.assertSameTenant(tenantId, input.parentId);
    return this.prisma.territory.create({
      data: {
        tenantId,
        apiName: input.apiName,
        label: input.label,
        description: input.description ?? null,
        parentId: input.parentId ?? null,
        type: input.type ?? 'geographic',
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateTerritory(tenantId: string, id: string, input: UpdateTerritoryInput) {
    await this.assertSameTenant(tenantId, id);
    if (input.parentId) {
      if (input.parentId === id) {
        throw new NotFoundException('Territory cannot be its own parent');
      }
      await this.assertSameTenant(tenantId, input.parentId);
      // Cycle guard: walk up the proposed parent's chain; if we hit `id`, reject.
      const ancestry = await this.collectAncestors(input.parentId);
      if (ancestry.has(id)) {
        throw new NotFoundException('Cycle detected: assigning that parent would create a loop');
      }
    }
    return this.prisma.territory.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async deleteTerritory(tenantId: string, id: string) {
    await this.assertSameTenant(tenantId, id);
    // onDelete cascades cover memberships/rules/account-assignments;
    // children territories get parentId set to null (SetNull in schema).
    await this.prisma.territory.delete({ where: { id } });
    return { ok: true };
  }

  // ── User membership ────────────────────────────────────────────────────────

  async assignUser(tenantId: string, territoryId: string, input: AssignUserInput) {
    await this.assertSameTenant(tenantId, territoryId);
    // If isPrimary is being set, demote any existing primary for this user.
    if (input.isPrimary) {
      await this.prisma.userTerritory.updateMany({
        where: { tenantId, userId: input.userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    // Manual find+create/update — the tenant-guard middleware rejects upsert
    // unless the where clause carries tenantId, but the unique index is
    // userId+territoryId (no tenantId in the compound). Both columns are
    // already tenant-scoped via FK, so this is safe.
    const existing = await this.prisma.userTerritory.findFirst({
      where: { tenantId, userId: input.userId, territoryId },
      select: { id: true },
    });
    if (existing) {
      return this.prisma.userTerritory.update({
        where: { id: existing.id },
        data: {
          roleInTerritory: input.roleInTerritory ?? 'rep',
          isPrimary: input.isPrimary ?? false,
        },
      });
    }
    return this.prisma.userTerritory.create({
      data: {
        tenantId,
        userId: input.userId,
        territoryId,
        roleInTerritory: input.roleInTerritory ?? 'rep',
        isPrimary: input.isPrimary ?? false,
      },
    });
  }

  async unassignUser(tenantId: string, territoryId: string, userId: string) {
    await this.prisma.userTerritory.deleteMany({
      where: { tenantId, territoryId, userId },
    });
    return { ok: true };
  }

  // ── Account assignment (manual / auto) ─────────────────────────────────────

  async assignAccount(
    tenantId: string,
    accountId: string,
    territoryId: string,
    opts: AssignAccountOpts = {},
  ) {
    await this.assertSameTenant(tenantId, territoryId);
    if (opts.isPrimary) {
      await this.prisma.accountTerritory.updateMany({
        where: { tenantId, accountId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    // See assignUser comment — tenant-guard requires tenantId in `where`,
    // but the unique compound is account+territory only. Find-then-write.
    const existing = await this.prisma.accountTerritory.findFirst({
      where: { tenantId, accountId, territoryId },
      select: { id: true },
    });
    if (existing) {
      return this.prisma.accountTerritory.update({
        where: { id: existing.id },
        data: {
          source: opts.source ?? 'manual',
          isPrimary: opts.isPrimary ?? false,
        },
      });
    }
    return this.prisma.accountTerritory.create({
      data: {
        tenantId,
        accountId,
        territoryId,
        source: opts.source ?? 'manual',
        isPrimary: opts.isPrimary ?? false,
      },
    });
  }

  async unassignAccount(tenantId: string, accountId: string, territoryId: string) {
    await this.prisma.accountTerritory.deleteMany({
      where: { tenantId, accountId, territoryId },
    });
    return { ok: true };
  }

  // ── Rule CRUD ──────────────────────────────────────────────────────────────

  async listRules(tenantId: string, territoryId: string) {
    await this.assertSameTenant(tenantId, territoryId);
    return this.prisma.territoryAssignmentRule.findMany({
      where: { tenantId, territoryId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createRule(tenantId: string, territoryId: string, input: CreateRuleInput) {
    await this.assertSameTenant(tenantId, territoryId);
    return this.prisma.territoryAssignmentRule.create({
      data: {
        tenantId,
        territoryId,
        name: input.name,
        description: input.description ?? null,
        conditions: (input.conditions ?? []) as never,
        matchType: input.matchType ?? 'all',
        priority: input.priority ?? 100,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateRule(tenantId: string, territoryId: string, ruleId: string, input: UpdateRuleInput) {
    await this.assertSameTenant(tenantId, territoryId);
    return this.prisma.territoryAssignmentRule.update({
      where: { id: ruleId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.conditions !== undefined ? { conditions: input.conditions as never } : {}),
        ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async deleteRule(tenantId: string, territoryId: string, ruleId: string) {
    await this.assertSameTenant(tenantId, territoryId);
    await this.prisma.territoryAssignmentRule.delete({ where: { id: ruleId } });
    return { ok: true };
  }

  // ── Tree / sharing helpers ─────────────────────────────────────────────────

  /**
   * BFS the territory tree from `territoryId` and return all descendant IDs
   * (NOT including the root). Depth capped at 16 — anything deeper is almost
   * certainly a cycle introduced through a backdoor (raw SQL); we return what
   * we have so far and log a warning.
   */
  async getDescendants(territoryId: string): Promise<string[]> {
    // We pull tenantId from the root once so subsequent queries satisfy the
    // tenant-guard middleware. This also serves as a not-found check.
    const root = await this.prisma.territory.findFirst({
      where: { id: territoryId },
      select: { tenantId: true },
      ...({ skipTenantGuard: true } as never),
    });
    if (!root) return [];
    const tenantId = (root as { tenantId: string }).tenantId;

    const descendants: string[] = [];
    let frontier: string[] = [territoryId];
    const visited = new Set<string>(frontier);

    for (let depth = 0; depth < MAX_TREE_DEPTH && frontier.length > 0; depth += 1) {
      const children = await this.prisma.territory.findMany({
        where: { tenantId, parentId: { in: frontier } },
        select: { id: true },
      });
      const next: string[] = [];
      for (const c of children) {
        if (visited.has(c.id)) continue;
        visited.add(c.id);
        descendants.push(c.id);
        next.push(c.id);
      }
      frontier = next;
    }
    if (frontier.length > 0) {
      this.log.warn(`getDescendants(${territoryId}) hit depth cap ${MAX_TREE_DEPTH}`);
    }
    return descendants;
  }

  /** Resolve every account ID this user can see by territory membership. */
  async accountsForUser(userId: string): Promise<Set<string>> {
    // tenant-guard requires tenantId on every where clause. Look up the
    // user first (skip-tenant-guard flag is the documented escape hatch for
    // bootstrap-style cross-tenant lookups; we use it here because the caller
    // only knows userId, not tenantId).
    const userRow: { tenantId: string } | null = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { tenantId: true },
      skipTenantGuard: true,
    } as never);
    if (!userRow) return new Set<string>();
    const tenantId = userRow.tenantId;
    const memberships = await this.prisma.userTerritory.findMany({
      where: { tenantId, userId },
      select: { tenantId: true, territoryId: true },
    });
    if (memberships.length === 0) return new Set<string>();

    const expanded = new Set<string>();
    for (const m of memberships) {
      expanded.add(m.territoryId);
      const subs = await this.getDescendants(m.territoryId);
      for (const s of subs) expanded.add(s);
    }

    if (expanded.size === 0) return new Set<string>();

    const rows = await this.prisma.accountTerritory.findMany({
      where: { tenantId, territoryId: { in: Array.from(expanded) } },
      select: { accountId: true },
    });
    return new Set(rows.map((r) => r.accountId));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async assertSameTenant(tenantId: string, territoryId: string): Promise<void> {
    const t = await this.prisma.territory.findFirst({
      where: { id: territoryId, tenantId },
      select: { id: true },
    });
    if (!t) throw new NotFoundException(`Territory ${territoryId} not found in tenant ${tenantId}`);
  }

  private async collectAncestors(territoryId: string): Promise<Set<string>> {
    const out = new Set<string>();
    let cursor: string | null = territoryId;
    let depth = 0;
    while (cursor && depth < MAX_TREE_DEPTH) {
      if (out.has(cursor)) break; // cycle guard
      out.add(cursor);
      const row: { parentId: string | null } | null = await this.prisma.territory.findFirst({
        where: { id: cursor },
        select: { parentId: true },
        ...({ skipTenantGuard: true } as never),
      });
      cursor = row?.parentId ?? null;
      depth += 1;
    }
    return out;
  }
}
