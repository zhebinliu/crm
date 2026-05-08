import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Wave 19b — Salesforce-style Record Types.
 *
 * A Record Type is a per-object subtype that scopes layout / picklist /
 * validation behavior. Example: Opportunity has record types `domestic`
 * (国内商机) and `overseas` (海外商机), each with its own stage picklist
 * and required fields.
 *
 * `picklistOverrides` is shaped `{ "<fieldApiName>": "<picklistId>", ... }`.
 * When a record's RT carries an override for a given field, validation
 * accepts only values from the override picklist; otherwise validation
 * falls back to the FieldDef's default picklist (and at that point this
 * service answers "true / pass" so the existing FieldDef-driven validators
 * remain authoritative).
 */
@Injectable()
export class RecordTypeService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────

  list(tenantId: string, objectApiName?: string) {
    return this.prisma.recordType.findMany({
      where: { tenantId, ...(objectApiName ? { objectApiName } : {}) },
      orderBy: [{ objectApiName: 'asc' }, { apiName: 'asc' }],
      include: { layout: { select: { id: true, apiName: true, label: true } } },
    });
  }

  async get(tenantId: string, id: string) {
    const rt = await this.prisma.recordType.findFirst({
      where: { id, tenantId },
      include: { layout: true },
    });
    if (!rt) throw new NotFoundException({ code: 'NOT_FOUND', message: 'RecordType not found' });
    return rt;
  }

  async create(tenantId: string, objectApiName: string, data: {
    apiName: string; label: string; description?: string;
    isDefault?: boolean; isActive?: boolean;
    picklistOverrides?: Record<string, string>;
    layoutId?: string | null;
  }) {
    if (!data.apiName) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'apiName required' });
    if (!data.label) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'label required' });

    return this.prisma.$transaction(async (tx) => {
      // Enforce single default: if isDefault=true, clear other defaults.
      if (data.isDefault) {
        await tx.recordType.updateMany({
          where: { tenantId, objectApiName, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.recordType.create({
        data: {
          tenantId,
          objectApiName,
          apiName: data.apiName,
          label: data.label,
          description: data.description,
          isDefault: data.isDefault ?? false,
          isActive: data.isActive ?? true,
          picklistOverrides: (data.picklistOverrides ?? {}) as object,
          layoutId: data.layoutId ?? null,
        },
      });
    });
  }

  async update(tenantId: string, id: string, data: {
    label?: string; description?: string;
    isDefault?: boolean; isActive?: boolean;
    picklistOverrides?: Record<string, string>;
    layoutId?: string | null;
  }) {
    const existing = await this.prisma.recordType.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'RecordType not found' });

    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.recordType.updateMany({
          where: { tenantId, objectApiName: existing.objectApiName, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      return tx.recordType.update({
        where: { id },
        data: {
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.picklistOverrides !== undefined
            ? { picklistOverrides: data.picklistOverrides as object }
            : {}),
          ...(data.layoutId !== undefined ? { layoutId: data.layoutId } : {}),
        },
      });
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.recordType.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'RecordType not found' });
    await this.prisma.recordType.delete({ where: { id } });
    return { ok: true };
  }

  // ── Defaulting helpers ───────────────────────────────────────────────────

  /**
   * Returns the single default Record Type for a (tenant,object) pair, or
   * null if none has been configured. We tolerate "no default": entity
   * services will simply leave recordTypeId null in that case.
   */
  async getDefaultForObject(tenantId: string, objectApiName: string) {
    return this.prisma.recordType.findFirst({
      where: { tenantId, objectApiName, isDefault: true, isActive: true },
    });
  }

  /**
   * Used by entity services on create. If `record.recordTypeId` is null/
   * undefined, set it to the configured default RT (if any). Mutates and
   * returns the same object for convenient chaining.
   *
   * Safe to call even when no record types exist for the object: in that
   * case it's a no-op and the column simply stays null.
   */
  async applyDefaults(
    tenantId: string,
    objectApiName: string,
    record: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (record['recordTypeId']) return record;
    const def = await this.getDefaultForObject(tenantId, objectApiName);
    if (def) record['recordTypeId'] = def.id;
    return record;
  }

  /**
   * Returns true if `value` is allowed by this RT's picklist override for
   * the given field, OR if no override is set (in which case the standard
   * FieldDef-driven validator remains authoritative — we don't double-
   * reject). Returns false only when an override exists and `value` is not
   * one of its active values.
   *
   * Hooked into ValidationRuleService at call time.
   */
  async validatePicklistValue(
    tenantId: string,
    recordTypeId: string,
    fieldApiName: string,
    value: unknown,
  ): Promise<boolean> {
    if (value === null || value === undefined || value === '') return true;
    const rt = await this.prisma.recordType.findFirst({
      where: { id: recordTypeId, tenantId },
      select: { picklistOverrides: true },
    });
    if (!rt) return true; // unknown RT → don't add a second rejection here.

    const overrides = (rt.picklistOverrides as Record<string, string>) ?? {};
    const picklistId = overrides[fieldApiName];
    if (!picklistId) return true; // no override → defer to default validator.

    const allowed = await this.prisma.picklistValue.findMany({
      where: { picklistId, isActive: true },
      select: { value: true },
    });
    const set = new Set(allowed.map((v) => v.value));
    if (Array.isArray(value)) {
      // MULTI_PICKLIST: every selected value must be allowed.
      return value.every((v) => set.has(String(v)));
    }
    return set.has(String(value));
  }
}
