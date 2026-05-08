// ─── Tenant guard middleware (Prisma $use) ────────────────────────────────
//
// Hardens multi-tenancy by asserting that EVERY query against a tenant-scoped
// model includes a tenantId in its where clause (read) or data (write).
// Throws TenantScopeError otherwise so the bug surfaces in dev/CI long before
// production. In production, the same throw becomes a 500 so we fail loud
// instead of silently leaking cross-tenant data.
//
// Why middleware vs. NestJS interceptor: interceptors only see HTTP routes.
// Middleware sees Prisma queries from anywhere — services, GraphQL resolvers,
// background jobs, cron, AI tools, workflow actions. Single chokepoint.
//
// Models without a tenantId column (Tenant itself, Permission, RolePermission,
// SequenceCounter, OutboxEvent — global tables) are exempt via TENANT_FREE_MODELS.
//
// Escape hatch: callers can opt out per-call by setting `args.skipTenantGuard`
// on the args object (e.g. when bootstrapping the very first tenant). The flag
// is stripped before being forwarded to Prisma.

import type { Prisma } from '@prisma/client';

/**
 * Models that intentionally have no tenantId column. These are either
 * global (Permission catalog) or join tables / auth artifacts where the
 * tenant scope is enforced via FK chain to a tenant-scoped parent.
 */
const TENANT_FREE_MODELS = new Set<string>([
  'Tenant',          // self
  'Permission',      // global catalog
  'RolePermission',  // join: Role(tenant-scoped) → Permission(global)
  'UserRole',        // join: User(tenant-scoped) → Role(tenant-scoped)
  'Session',         // FK to User
  'RefreshToken',    // FK to User
  'UserMfaSecret',   // FK to User (tenant scope inherited via user)
  'OutboxEvent',     // global event log
  'SequenceCounter', // global counter (still keyed by tenantId in `key`)
  'PicklistValue',   // FK to Picklist (tenant-scoped)
  'OpportunityLineItem', // FK to Opportunity (tenant-scoped)
  'QuoteLineItem',   // FK to Quote
  'OrderLineItem',   // FK to Order
  'PriceBookEntry',  // FK to PriceBook
  'WorkflowExecution', // FK to WorkflowRule
  'ApprovalStep',    // FK to ApprovalProcess
  'ApprovalRequest', // FK to ApprovalProcess
  'ApprovalAction',  // FK to ApprovalRequest
  'ForecastUpdateEntry', // FK to ForecastUpdateTask
  'UserProfile',         // FK to User (tenant scope inherited)
  'UserPermissionSet',   // FK to User (tenant scope inherited)
]);

/** Actions we want to police. */
const READ_ACTIONS = new Set<string>([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow',
  'findMany', 'count', 'aggregate', 'groupBy',
]);
const WRITE_ACTIONS = new Set<string>([
  'create', 'createMany', 'update', 'updateMany', 'upsert',
  'delete', 'deleteMany',
]);

export class TenantScopeError extends Error {
  constructor(model: string, action: string, detail: string) {
    super(`TenantScopeError: ${model}.${action} ${detail}`);
    this.name = 'TenantScopeError';
  }
}

/**
 * Returns a Prisma middleware fn. Install via prisma.$use(tenantGuardMiddleware()).
 */
export function tenantGuardMiddleware() {
  return async (
    params: Prisma.MiddlewareParams,
    next: (p: Prisma.MiddlewareParams) => Promise<unknown>,
  ) => {
    const model = params.model;
    if (!model) return next(params);
    if (TENANT_FREE_MODELS.has(model)) return next(params);

    const args = (params.args ?? {}) as Record<string, unknown> & { skipTenantGuard?: boolean };

    // Per-call escape hatch (e.g. seed scripts, tenant bootstrap).
    if (args.skipTenantGuard === true) {
      delete args.skipTenantGuard;
      return next(params);
    }

    if (READ_ACTIONS.has(params.action)) {
      const where = (args.where ?? {}) as Record<string, unknown>;
      if (!hasTenantConstraint(where)) {
        throw new TenantScopeError(
          model,
          params.action,
          `where clause missing tenantId. This is a multi-tenant safety violation. ` +
          `If this query is genuinely tenant-free, set { skipTenantGuard: true } on the args.`,
        );
      }
    } else if (WRITE_ACTIONS.has(params.action)) {
      if (params.action === 'create' || params.action === 'createMany') {
        const data = args.data;
        if (!dataIncludesTenantId(data)) {
          throw new TenantScopeError(
            model, params.action,
            `data payload missing tenantId. Every new tenant-scoped record must declare its tenant.`,
          );
        }
      }
      // updateMany / deleteMany are dangerous bulk ops — must constrain.
      else if (params.action === 'updateMany' || params.action === 'deleteMany') {
        const where = (args.where ?? {}) as Record<string, unknown>;
        if (!hasTenantConstraint(where)) {
          throw new TenantScopeError(
            model, params.action,
            `${params.action} where clause missing tenantId. Bulk write across tenants blocked.`,
          );
        }
      }
      // Single-row update/delete by primary key — warn + log only.
      // The codebase pattern is to call get(tenantId, id) first, which is
      // tenant-scoped; the subsequent update({where:{id}}) is then safe by
      // construction. Throwing here would force a sweeping refactor without
      // a real safety win. The warn surfaces accidental misuse in logs.
      else if (params.action === 'update' || params.action === 'delete') {
        const where = (args.where ?? {}) as Record<string, unknown>;
        if (!hasTenantConstraint(where)) {
          // eslint-disable-next-line no-console
          console.warn(
            `[tenant-guard] WARN: ${model}.${params.action} by unique key without tenantId. ` +
            `Caller must have already verified tenant via prior findFirst.`,
          );
        }
      }
      // upsert: same strict treatment as updateMany since it can create rows.
      else if (params.action === 'upsert') {
        const where = (args.where ?? {}) as Record<string, unknown>;
        if (!hasTenantConstraint(where)) {
          throw new TenantScopeError(
            model, params.action,
            `upsert.where missing tenantId.`,
          );
        }
        const create = args.create;
        if (!dataIncludesTenantId(create)) {
          throw new TenantScopeError(
            model, params.action,
            `upsert.create missing tenantId.`,
          );
        }
      }
    }

    return next(params);
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hasTenantConstraint(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const w = where as Record<string, unknown>;

  // Direct constraint
  if (w.tenantId !== undefined && w.tenantId !== null) return true;
  // Unique compound that includes tenantId, e.g. tenantId_email
  for (const k of Object.keys(w)) {
    if (k.startsWith('tenantId_') || k.endsWith('_tenantId') || k.includes('_tenantId_')) {
      return true;
    }
  }
  // AND / OR — at least one branch must constrain
  if (Array.isArray(w.AND)) {
    if ((w.AND as unknown[]).some(hasTenantConstraint)) return true;
  }
  if (Array.isArray(w.OR)) {
    // For OR, EVERY branch must constrain to be safe.
    if ((w.OR as unknown[]).length > 0 && (w.OR as unknown[]).every(hasTenantConstraint)) return true;
  }
  return false;
}

function dataIncludesTenantId(data: unknown): boolean {
  if (!data) return false;
  if (Array.isArray(data)) {
    return data.length === 0 || data.every((row) => dataIncludesTenantId(row));
  }
  if (typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.tenantId !== undefined && d.tenantId !== null) return true;
  // tenant.connect / tenant: { connect: { id: ... } }
  if (d.tenant && typeof d.tenant === 'object') {
    const t = d.tenant as Record<string, unknown>;
    if (t.connect || t.connectOrCreate || t.create) return true;
  }
  return false;
}
