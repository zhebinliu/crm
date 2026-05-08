// ─── DataLoaderRegistry — per-request batching for GraphQL resolvers ────
//
// GraphQL @ResolveField resolvers are called once per parent. Naively
// each one issues `prisma.x.findFirst({ where: { id }})` — the textbook
// N+1 pattern. DataLoader collapses one tick's worth of `.load(key)`
// calls into a single `findMany({ where: { id: { in: keys }}})`.
//
// ONE registry per HTTP request — see ContextFactory in app.module wiring
// instructions. DO NOT re-use across requests: a long-lived loader caches
// stale data and crosses tenants.
//
// Initial loaders:
//   • accountById            : id            → Account (tenant-scoped)
//   • contactsByAccountId    : accountId     → Contact[] (tenant-scoped)
//   • opportunitiesByAccountId: accountId     → Opportunity[] (tenant-scoped)
//   • userById               : id            → User
//
// Batching note: Prisma rejects multi-tenant findMany with a single
// `tenantId: { in: [...] }`, so each request's DataLoaderRegistry is
// scoped to a single tenantId (passed by the GraphQL context factory).

import DataLoader from 'dataloader';
import type { PrismaService } from '../../prisma/prisma.service';

interface AccountRow { id: string; tenantId: string; [k: string]: unknown }
interface ContactRow { id: string; tenantId: string; accountId: string | null; [k: string]: unknown }
interface OpportunityRow { id: string; tenantId: string; accountId: string | null; [k: string]: unknown }
interface UserRow { id: string; tenantId: string; [k: string]: unknown }

export class DataLoaderRegistry {
  readonly accountById: DataLoader<string, AccountRow | null>;
  readonly contactsByAccountId: DataLoader<string, ContactRow[]>;
  readonly opportunitiesByAccountId: DataLoader<string, OpportunityRow[]>;
  readonly userById: DataLoader<string, UserRow | null>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantId: string | null,
  ) {
    // ── accountById ──────────────────────────────────────────────────
    this.accountById = new DataLoader<string, AccountRow | null>(async (ids) => {
      if (!this.tenantId) return ids.map(() => null);
      const rows = await prisma.account.findMany({
        where: { tenantId: this.tenantId, deletedAt: null, id: { in: [...ids] } },
      }) as unknown as AccountRow[];
      const byId = new Map<string, AccountRow>();
      for (const r of rows) byId.set(r.id, r);
      return ids.map((id) => byId.get(id) ?? null);
    });

    // ── contactsByAccountId — one-to-many ────────────────────────────
    this.contactsByAccountId = new DataLoader<string, ContactRow[]>(async (accountIds) => {
      if (!this.tenantId) return accountIds.map(() => []);
      const rows = await prisma.contact.findMany({
        where: {
          tenantId: this.tenantId,
          deletedAt: null,
          accountId: { in: [...accountIds] },
        },
        orderBy: { createdAt: 'desc' },
      }) as unknown as ContactRow[];
      const grouped = new Map<string, ContactRow[]>();
      for (const r of rows) {
        const k = r.accountId ?? '';
        if (!k) continue;
        let bucket = grouped.get(k);
        if (!bucket) { bucket = []; grouped.set(k, bucket); }
        bucket.push(r);
      }
      return accountIds.map((id) => grouped.get(id) ?? []);
    });

    // ── opportunitiesByAccountId — one-to-many ───────────────────────
    this.opportunitiesByAccountId = new DataLoader<string, OpportunityRow[]>(async (accountIds) => {
      if (!this.tenantId) return accountIds.map(() => []);
      const rows = await prisma.opportunity.findMany({
        where: {
          tenantId: this.tenantId,
          deletedAt: null,
          accountId: { in: [...accountIds] },
        },
        orderBy: { createdAt: 'desc' },
      }) as unknown as OpportunityRow[];
      const grouped = new Map<string, OpportunityRow[]>();
      for (const r of rows) {
        const k = r.accountId ?? '';
        if (!k) continue;
        let bucket = grouped.get(k);
        if (!bucket) { bucket = []; grouped.set(k, bucket); }
        bucket.push(r);
      }
      return accountIds.map((id) => grouped.get(id) ?? []);
    });

    // ── userById ─────────────────────────────────────────────────────
    this.userById = new DataLoader<string, UserRow | null>(async (ids) => {
      if (!this.tenantId) return ids.map(() => null);
      const rows = await prisma.user.findMany({
        where: { tenantId: this.tenantId, id: { in: [...ids] } },
      }) as unknown as UserRow[];
      const byId = new Map<string, UserRow>();
      for (const r of rows) byId.set(r.id, r);
      return ids.map((id) => byId.get(id) ?? null);
    });
  }
}
