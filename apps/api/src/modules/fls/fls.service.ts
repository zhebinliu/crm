// ─── FlsService ──────────────────────────────────────────────────────────
// Field-Level Security enforcement (Wave 16a).
//
// FieldDef.readPermission and FieldDef.writePermission already exist in the
// schema and store a permission code (e.g. "opportunity.read_amount") that
// gates access to a single field. They were never enforced — list/get
// returned every column and create/update accepted every field. This service
// closes the gap.
//
// Two enforcement modes:
//   • READ — strip silently. filterReadable / filterReadableMany delete the
//     keys the user can't read; clients see the record without the field.
//     Done after FormulaService.decorate so computed fields are also gated.
//   • WRITE — reject loudly. assertWritable throws ForbiddenException with
//     code FLS_DENIED listing the rejected field apiNames so the caller
//     learns exactly which fields they tried to set without permission.
//
// FieldDef rows are loaded once per (tenantId, objectApiName) and cached
// for 60s in-memory. MetadataService should call invalidate() whenever
// readPermission/writePermission/apiName changes on a field.

import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hasPermission, type PermissionCode } from '@tokenwave/shared';
import type { RequestUser } from '../../common/types/request-context';

interface FlsFieldDef {
  apiName: string;
  readPermission: string | null;
  writePermission: string | null;
}

@Injectable()
export class FlsService {
  private readonly log = new Logger(FlsService.name);
  private readonly fieldsCache = new Map<string, { value: FlsFieldDef[]; expires: number }>();
  private static readonly TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Strip fields the user lacks `readPermission` for from a single record.
   * Mutates and returns the same record reference. Null/undefined records
   * pass through unchanged.
   */
  async filterReadable<T extends Record<string, unknown> | null | undefined>(
    user: RequestUser | null | undefined,
    objectApiName: string,
    record: T,
  ): Promise<T> {
    if (!record || !user) return record;
    const fields = await this.fieldsFor(user.tenantId, objectApiName);
    const stripped = this.collectUnreadable(fields, user.permissions ?? []);
    if (stripped.length === 0) return record;
    for (const apiName of stripped) {
      delete (record as Record<string, unknown>)[apiName];
    }
    return record;
  }

  /** Same as filterReadable but for arrays. Mutates in place. */
  async filterReadableMany<T extends Record<string, unknown>>(
    user: RequestUser | null | undefined,
    objectApiName: string,
    records: T[],
  ): Promise<T[]> {
    if (!records || records.length === 0 || !user) return records;
    const fields = await this.fieldsFor(user.tenantId, objectApiName);
    const stripped = this.collectUnreadable(fields, user.permissions ?? []);
    if (stripped.length === 0) return records;
    for (const r of records) {
      for (const apiName of stripped) {
        delete (r as Record<string, unknown>)[apiName];
      }
    }
    return records;
  }

  /**
   * Throw if the input contains any field whose `writePermission` the user
   * lacks. The thrown ForbiddenException carries `code: 'FLS_DENIED'` and a
   * `fields` array so the caller can show a precise error.
   */
  async assertWritable(
    user: RequestUser | null | undefined,
    objectApiName: string,
    input: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    if (!input || !user) return;
    const fields = await this.fieldsFor(user.tenantId, objectApiName);
    if (fields.length === 0) return;
    const granted = user.permissions ?? [];
    const denied: string[] = [];
    for (const f of fields) {
      if (!f.writePermission) continue;
      if (!(f.apiName in input)) continue;
      if (!hasPermission(granted, f.writePermission as PermissionCode)) {
        denied.push(f.apiName);
      }
    }
    if (denied.length > 0) {
      throw new ForbiddenException({
        code: 'FLS_DENIED',
        message: `You do not have permission to write the following fields: ${denied.join(', ')}`,
        fields: denied,
      });
    }
  }

  /** Drop the cached entry for one (tenant, object) pair. Called by MetadataService after field edits. */
  invalidate(tenantId: string, objectApiName: string): void {
    this.fieldsCache.delete(this.cacheKey(tenantId, objectApiName));
  }

  /** Drop every cache entry for a tenant — useful after bulk metadata imports. */
  invalidateTenant(tenantId: string): void {
    const prefix = `${tenantId}:`;
    for (const k of this.fieldsCache.keys()) {
      if (k.startsWith(prefix)) this.fieldsCache.delete(k);
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private collectUnreadable(fields: FlsFieldDef[], granted: string[]): string[] {
    const out: string[] = [];
    for (const f of fields) {
      if (!f.readPermission) continue;
      if (!hasPermission(granted, f.readPermission as PermissionCode)) {
        out.push(f.apiName);
      }
    }
    return out;
  }

  private cacheKey(tenantId: string, objectApiName: string): string {
    return `${tenantId}:${objectApiName.toLowerCase()}`;
  }

  private async fieldsFor(tenantId: string, objectApiName: string): Promise<FlsFieldDef[]> {
    const key = this.cacheKey(tenantId, objectApiName);
    const cached = this.fieldsCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;

    const obj = await this.prisma.objectDef.findFirst({
      where: { tenantId, apiName: objectApiName.toLowerCase() },
      select: { id: true },
    });
    if (!obj) {
      this.fieldsCache.set(key, { value: [], expires: Date.now() + FlsService.TTL_MS });
      return [];
    }
    const rows = await this.prisma.fieldDef.findMany({
      where: {
        tenantId,
        objectId: obj.id,
        OR: [{ readPermission: { not: null } }, { writePermission: { not: null } }],
      },
      select: { apiName: true, readPermission: true, writePermission: true },
    });
    this.fieldsCache.set(key, { value: rows, expires: Date.now() + FlsService.TTL_MS });
    return rows;
  }
}
