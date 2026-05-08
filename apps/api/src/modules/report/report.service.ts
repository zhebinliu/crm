// ─── ReportService — SF-style Reports engine (Wave 19a) ─────────────────────
//
// A "Report" is a saved query against a "Report Type" (a base object plus
// permitted joins). Reports support tabular, summary (groupBy), and matrix
// (groupBy on rows AND columns) formats with aggregates (sum/avg/min/max/
// count). The engine compiles a report config into a Prisma query — there
// is intentionally no SOQL-like text DSL in v1; the config JSON is the
// source of truth and the front-end report builder produces it directly.
//
// Tenant isolation is enforced both by an explicit tenantId filter and by
// PrismaService's tenant-guard middleware.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ── Public types ────────────────────────────────────────────────────────────

export type ReportFormat = 'tabular' | 'summary' | 'matrix';
export type AggregateType = 'sum' | 'avg' | 'min' | 'max' | 'count';
export type FilterOperator =
  | 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'startsWith' | 'endsWith' | 'isNull' | 'isNotNull';

export interface ReportFilter {
  field: string;
  op: FilterOperator;
  value?: unknown;
}

export interface ReportAggregate {
  type: AggregateType;
  /** Required for sum/avg/min/max; optional for count (defaults to id). */
  field?: string;
  /** Optional output alias used in totals/grouped rows. Defaults to `${type}_${field}`. */
  alias?: string;
}

export interface ReportSort {
  field: string;
  direction?: 'asc' | 'desc';
}

export interface ReportConfig {
  columns: string[];
  filters?: ReportFilter[];
  groupBy?: string[];
  aggregates?: ReportAggregate[];
  sortBy?: ReportSort[];
  limit?: number;
}

export interface RunReportResult {
  columns: string[];
  rows: Record<string, unknown>[];
  /** Present when groupBy is non-empty. */
  grouped?: Array<{
    key: Record<string, unknown>;
    aggregates: Record<string, number>;
    count: number;
  }>;
  /** Aggregates over the entire (post-filter) dataset. */
  totals?: Record<string, number>;
}

// ── Object registry ─────────────────────────────────────────────────────────
// Maps a "baseObject" (api name) to the Prisma delegate name and the joinable
// relations we expose to reports.

interface ObjectMeta {
  delegate:
    | 'lead'
    | 'account'
    | 'contact'
    | 'opportunity'
    | 'case'
    | 'quote'
    | 'order'
    | 'contract'
    | 'activity';
  /** Field names that can appear directly in `columns` / `filters`. */
  baseFields: readonly string[];
  /** Permitted joins; key is the alias used in dotted column paths. */
  joins: Record<
    string,
    { include: string; selectFields: readonly string[] }
  >;
}

const OBJECT_REGISTRY: Record<string, ObjectMeta> = {
  lead: {
    delegate: 'lead',
    baseFields: [
      'id', 'firstName', 'lastName', 'company', 'email', 'phone',
      'status', 'rating', 'source', 'industry', 'annualRevenue',
      'employeeCount', 'score', 'isConverted', 'ownerId', 'createdAt', 'updatedAt',
    ],
    joins: {
      owner: {
        include: 'owner',
        selectFields: ['id', 'displayName', 'email'],
      },
    },
  },
  opportunity: {
    delegate: 'opportunity',
    baseFields: [
      'id', 'name', 'stage', 'amount', 'currencyCode', 'probability',
      'forecastCategory', 'closeDate', 'type', 'leadSource', 'isClosed',
      'isWon', 'lossReason', 'ownerId', 'accountId', 'createdAt', 'updatedAt',
    ],
    joins: {
      account: {
        include: 'account',
        selectFields: ['id', 'name', 'industry', 'type'],
      },
      owner: {
        include: 'owner',
        selectFields: ['id', 'displayName', 'email'],
      },
    },
  },
  case: {
    delegate: 'case',
    baseFields: [
      'id', 'caseNumber', 'subject', 'status', 'priority', 'source',
      'slaTargetAt', 'resolvedAt', 'ownerId', 'accountId', 'contactId',
      'createdAt', 'updatedAt',
    ],
    joins: {
      account: {
        include: 'account',
        selectFields: ['id', 'name', 'industry'],
      },
      contact: {
        include: 'contact',
        selectFields: ['id', 'firstName', 'lastName', 'email'],
      },
    },
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function aliasFor(agg: ReportAggregate): string {
  if (agg.alias) return agg.alias;
  if (agg.type === 'count') return `count_${agg.field ?? 'id'}`;
  return `${agg.type}_${agg.field ?? 'value'}`;
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  // Prisma Decimal exposes toNumber()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  return 0;
}

function pickPath(obj: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

@Injectable()
export class ReportService {
  private readonly log = new Logger(ReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    ownerId: string,
    dto: {
      reportTypeId: string;
      name: string;
      description?: string;
      format?: ReportFormat;
      config: ReportConfig;
      isPublic?: boolean;
      folderName?: string;
    },
  ) {
    const rt = await this.prisma.reportType.findFirst({
      where: { id: dto.reportTypeId, tenantId },
    });
    if (!rt) throw new NotFoundException(`ReportType ${dto.reportTypeId} not found`);
    this.validateConfig(rt.baseObject, dto.config);

    return this.prisma.reportDef.create({
      data: {
        tenantId,
        ownerId,
        reportTypeId: dto.reportTypeId,
        name: dto.name,
        description: dto.description ?? null,
        format: dto.format ?? 'tabular',
        config: dto.config as never,
        isPublic: dto.isPublic ?? false,
        folderName: dto.folderName ?? null,
      },
    });
  }

  async update(
    tenantId: string,
    ownerId: string,
    reportId: string,
    dto: Partial<{
      name: string;
      description: string | null;
      format: ReportFormat;
      config: ReportConfig;
      isPublic: boolean;
      folderName: string | null;
    }>,
  ) {
    const existing = await this.prisma.reportDef.findFirst({
      where: { id: reportId, tenantId },
      include: { reportType: true },
    });
    if (!existing) throw new NotFoundException(`Report ${reportId} not found`);
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenException('Only the report owner may edit it');
    }
    if (dto.config) this.validateConfig(existing.reportType.baseObject, dto.config);

    return this.prisma.reportDef.update({
      where: { id: reportId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.format !== undefined ? { format: dto.format } : {}),
        ...(dto.config !== undefined ? { config: dto.config as never } : {}),
        ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
        ...(dto.folderName !== undefined ? { folderName: dto.folderName } : {}),
      },
    });
  }

  async delete(tenantId: string, ownerId: string, reportId: string) {
    const existing = await this.prisma.reportDef.findFirst({
      where: { id: reportId, tenantId },
    });
    if (!existing) throw new NotFoundException(`Report ${reportId} not found`);
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenException('Only the report owner may delete it');
    }
    await this.prisma.reportDef.delete({ where: { id: reportId } });
    return { ok: true };
  }

  /** List reports the user can see: their own + public ones. */
  async list(tenantId: string, userId: string) {
    return this.prisma.reportDef.findMany({
      where: {
        tenantId,
        OR: [{ ownerId: userId }, { isPublic: true }],
      },
      orderBy: { updatedAt: 'desc' },
      include: { reportType: { select: { id: true, apiName: true, label: true, baseObject: true } } },
    });
  }

  async get(tenantId: string, userId: string, reportId: string) {
    const r = await this.prisma.reportDef.findFirst({
      where: { id: reportId, tenantId },
      include: { reportType: true },
    });
    if (!r) throw new NotFoundException(`Report ${reportId} not found`);
    if (!r.isPublic && r.ownerId !== userId) {
      throw new ForbiddenException('Report is private');
    }
    return r;
  }

  // ── Report types ──────────────────────────────────────────────────────────

  async listReportTypes(tenantId: string) {
    return this.prisma.reportType.findMany({
      where: { tenantId },
      orderBy: { label: 'asc' },
    });
  }

  async createReportType(
    tenantId: string,
    dto: {
      apiName: string;
      label: string;
      baseObject: string;
      joins?: Array<{ object: string; foreignKey: string; alias: string }>;
      availableColumns?: string[];
      isStandard?: boolean;
    },
  ) {
    if (!OBJECT_REGISTRY[dto.baseObject]) {
      throw new BadRequestException(`Unsupported baseObject: ${dto.baseObject}`);
    }
    return this.prisma.reportType.create({
      data: {
        tenantId,
        apiName: dto.apiName,
        label: dto.label,
        baseObject: dto.baseObject,
        joins: (dto.joins ?? []) as never,
        availableColumns: (dto.availableColumns ?? this.deriveAvailableColumns(dto.baseObject)) as never,
        isStandard: dto.isStandard ?? false,
      },
    });
  }

  /** Tenant-scoped seed of standard report types. Idempotent. */
  async seedStandardReportTypes(tenantId: string): Promise<number> {
    const standards: Array<{
      apiName: string;
      label: string;
      baseObject: string;
      joins: Array<{ object: string; foreignKey: string; alias: string }>;
    }> = [
      { apiName: 'leads', label: 'Leads', baseObject: 'lead', joins: [] },
      {
        apiName: 'opportunities_with_account',
        label: 'Opportunities with Account',
        baseObject: 'opportunity',
        joins: [{ object: 'account', foreignKey: 'accountId', alias: 'account' }],
      },
      {
        apiName: 'cases_with_contact',
        label: 'Cases with Contact and Account',
        baseObject: 'case',
        joins: [
          { object: 'contact', foreignKey: 'contactId', alias: 'contact' },
          { object: 'account', foreignKey: 'accountId', alias: 'account' },
        ],
      },
    ];

    let created = 0;
    for (const s of standards) {
      const existing = await this.prisma.reportType.findFirst({
        where: { tenantId, apiName: s.apiName },
      });
      if (existing) continue;
      await this.prisma.reportType.create({
        data: {
          tenantId,
          apiName: s.apiName,
          label: s.label,
          baseObject: s.baseObject,
          joins: s.joins as never,
          availableColumns: this.deriveAvailableColumns(s.baseObject) as never,
          isStandard: true,
        },
      });
      created += 1;
    }
    return created;
  }

  // ── Engine ────────────────────────────────────────────────────────────────

  /** Run a saved report; runtime filters override/extend the saved config. */
  async runReport(
    tenantId: string,
    reportId: string,
    runtimeFilters?: ReportFilter[],
  ): Promise<RunReportResult> {
    const r = await this.prisma.reportDef.findFirst({
      where: { id: reportId, tenantId },
      include: { reportType: true },
    });
    if (!r) throw new NotFoundException(`Report ${reportId} not found`);

    const cfg = r.config as unknown as ReportConfig;
    const merged: ReportConfig = {
      ...cfg,
      filters: [...(cfg.filters ?? []), ...(runtimeFilters ?? [])],
    };
    return this.executeConfig(tenantId, r.reportType.baseObject, merged);
  }

  /** Run an ad-hoc config (for the report-builder preview). */
  async runAdHoc(
    tenantId: string,
    baseObject: string,
    config: ReportConfig,
  ): Promise<RunReportResult> {
    return this.executeConfig(tenantId, baseObject, config);
  }

  // ── Private compilation ──────────────────────────────────────────────────

  private async executeConfig(
    tenantId: string,
    baseObject: string,
    config: ReportConfig,
  ): Promise<RunReportResult> {
    const meta = OBJECT_REGISTRY[baseObject];
    if (!meta) throw new BadRequestException(`Unsupported baseObject: ${baseObject}`);
    this.validateConfig(baseObject, config);

    const where = this.compileWhere(tenantId, config.filters ?? [], meta);
    const include = this.compileInclude(config.columns, meta);
    const orderBy = (config.sortBy ?? [])
      .filter((s) => meta.baseFields.includes(s.field))
      .map((s) => ({ [s.field]: s.direction ?? 'asc' }));
    const take = config.limit ?? 1000;

    // Pull rows. For aggregates / groupBy, we still pull rows because Prisma's
    // groupBy doesn't support relation joins — we group in-process which is
    // fine for v1 (capped at `take`).
    const delegate = (this.prisma as unknown as Record<string, {
      findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
    }>)[meta.delegate];
    if (!delegate) {
      throw new BadRequestException(`Prisma delegate missing: ${meta.delegate}`);
    }

    const raw = await delegate.findMany({
      where,
      include: Object.keys(include).length ? include : undefined,
      orderBy: orderBy.length ? orderBy : undefined,
      take,
    });

    // Project columns into flat rows keyed by dotted path.
    const rows: Record<string, unknown>[] = raw.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of config.columns) {
        out[col] = pickPath(row as Record<string, unknown>, col);
      }
      // Include groupBy fields so callers can bucket without re-fetching.
      for (const g of config.groupBy ?? []) {
        if (!(g in out)) out[g] = pickPath(row as Record<string, unknown>, g);
      }
      // And aggregate source fields (so totals can be re-derived).
      for (const a of config.aggregates ?? []) {
        if (a.field && !(a.field in out)) {
          out[a.field] = pickPath(row as Record<string, unknown>, a.field);
        }
      }
      return out;
    });

    const result: RunReportResult = { columns: config.columns, rows };

    // Aggregate totals over the full result.
    if ((config.aggregates ?? []).length > 0) {
      result.totals = this.computeAggregates(rows, config.aggregates ?? []);
    }

    // Grouping (summary / matrix v1: single-axis grouping, summed per group).
    if ((config.groupBy ?? []).length > 0) {
      const buckets = new Map<string, { key: Record<string, unknown>; values: Record<string, unknown>[] }>();
      for (const row of rows) {
        const key: Record<string, unknown> = {};
        for (const g of config.groupBy!) key[g] = row[g];
        const k = JSON.stringify(key);
        if (!buckets.has(k)) buckets.set(k, { key, values: [] });
        buckets.get(k)!.values.push(row);
      }
      result.grouped = Array.from(buckets.values()).map((b) => ({
        key: b.key,
        count: b.values.length,
        aggregates: this.computeAggregates(b.values, config.aggregates ?? []),
      }));
    }

    return result;
  }

  private compileWhere(
    tenantId: string,
    filters: ReportFilter[],
    meta: ObjectMeta,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = { tenantId };
    // Soft-delete aware (every recycle-bin-eligible model has deletedAt).
    if (meta.baseFields.includes('id') && this.hasDeletedAt(meta.delegate)) {
      where.deletedAt = null;
    }

    for (const f of filters) {
      const path = f.field.split('.');
      const leaf = path[path.length - 1];
      if (!leaf) continue;
      const target = this.targetForPath(where, path);
      target[leaf] = this.compileOp(f);
    }
    return where;
  }

  private hasDeletedAt(delegate: ObjectMeta['delegate']): boolean {
    return ['lead', 'account', 'contact', 'opportunity', 'quote', 'order', 'contract', 'activity', 'case'].includes(
      delegate,
    );
  }

  private targetForPath(
    where: Record<string, unknown>,
    path: string[],
  ): Record<string, unknown> {
    if (path.length === 1) return where;
    let cur = where;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!key) continue;
      if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key] as Record<string, unknown>;
    }
    return cur;
  }

  private compileOp(f: ReportFilter): unknown {
    switch (f.op) {
      case 'eq':         return f.value;
      case 'neq':        return { not: f.value };
      case 'in':         return { in: f.value as unknown[] };
      case 'nin':        return { notIn: f.value as unknown[] };
      case 'gt':         return { gt: f.value };
      case 'gte':        return { gte: f.value };
      case 'lt':         return { lt: f.value };
      case 'lte':        return { lte: f.value };
      case 'contains':   return { contains: String(f.value), mode: 'insensitive' };
      case 'startsWith': return { startsWith: String(f.value), mode: 'insensitive' };
      case 'endsWith':   return { endsWith: String(f.value), mode: 'insensitive' };
      case 'isNull':     return null;
      case 'isNotNull':  return { not: null };
      default: throw new BadRequestException(`Unsupported filter op: ${(f as ReportFilter).op}`);
    }
  }

  private compileInclude(
    columns: string[],
    meta: ObjectMeta,
  ): Record<string, unknown> {
    const include: Record<string, unknown> = {};
    for (const col of columns) {
      if (!col.includes('.')) continue;
      const alias = col.split('.')[0];
      if (!alias) continue;
      const join = meta.joins[alias];
      if (!join) {
        throw new BadRequestException(
          `Column ${col} references unknown join "${alias}". Allowed: ${Object.keys(meta.joins).join(', ') || '(none)'}`,
        );
      }
      include[join.include] = true;
    }
    return include;
  }

  private computeAggregates(
    rows: Record<string, unknown>[],
    aggs: ReportAggregate[],
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const a of aggs) {
      const key = aliasFor(a);
      if (a.type === 'count') {
        out[key] = a.field
          ? rows.reduce((n, r) => n + (r[a.field!] != null ? 1 : 0), 0)
          : rows.length;
        continue;
      }
      const values = rows
        .map((r) => toNumber(pickPath(r, a.field!)))
        .filter((v) => Number.isFinite(v));
      if (values.length === 0) {
        out[key] = 0;
        continue;
      }
      switch (a.type) {
        case 'sum': out[key] = values.reduce((s, v) => s + v, 0); break;
        case 'avg': out[key] = values.reduce((s, v) => s + v, 0) / values.length; break;
        case 'min': out[key] = Math.min(...values); break;
        case 'max': out[key] = Math.max(...values); break;
      }
    }
    return out;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private validateConfig(baseObject: string, config: ReportConfig): void {
    const meta = OBJECT_REGISTRY[baseObject];
    if (!meta) throw new BadRequestException(`Unsupported baseObject: ${baseObject}`);

    if (!Array.isArray(config.columns) || config.columns.length === 0) {
      throw new BadRequestException('config.columns must be a non-empty array');
    }
    const allowed = new Set<string>(this.deriveAvailableColumns(baseObject));
    for (const c of config.columns) {
      if (!allowed.has(c)) throw new BadRequestException(`Column not allowed: ${c}`);
    }
    for (const f of config.filters ?? []) {
      if (!allowed.has(f.field)) throw new BadRequestException(`Filter field not allowed: ${f.field}`);
    }
    for (const g of config.groupBy ?? []) {
      if (!allowed.has(g)) throw new BadRequestException(`Group field not allowed: ${g}`);
    }
    for (const a of config.aggregates ?? []) {
      if (a.field && !allowed.has(a.field)) {
        throw new BadRequestException(`Aggregate field not allowed: ${a.field}`);
      }
    }
  }

  private deriveAvailableColumns(baseObject: string): string[] {
    const meta = OBJECT_REGISTRY[baseObject];
    if (!meta) return [];
    const cols = [...meta.baseFields];
    for (const [alias, join] of Object.entries(meta.joins)) {
      for (const f of join.selectFields) cols.push(`${alias}.${f}`);
    }
    return cols;
  }
}
