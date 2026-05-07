import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldType } from '@prisma/client';
import { FormulaService } from '../formula/formula.service';
import { FlsService } from '../fls/fls.service';

@Injectable()
export class MetadataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formula: FormulaService,
    private readonly fls: FlsService,
  ) {}

  // ── Objects ───────────────────────────────────────────────────────────────

  listObjects(tenantId: string) {
    return this.prisma.objectDef.findMany({
      where: { tenantId },
      include: { _count: { select: { fields: true } } },
      orderBy: { apiName: 'asc' },
    });
  }

  async getObject(tenantId: string, apiName: string) {
    // Standard objects are stored lowercase; tolerate either case from callers.
    const obj = await this.prisma.objectDef.findFirst({
      where: {
        tenantId,
        OR: [{ apiName }, { apiName: apiName.toLowerCase() }],
      },
      include: { fields: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!obj) throw new NotFoundException({ code: 'NOT_FOUND', message: `Object ${apiName} not found` });

    // Discover child relationships (Related Lists)
    // Find all fields in other objects that point to this object as a REFERENCE
    const childFields = await this.prisma.fieldDef.findMany({
      where: {
        tenantId,
        type: 'REFERENCE',
        referenceTo: apiName,
      },
      include: {
        object: {
          select: {
            apiName: true,
            labelPlural: true,
            label: true,
          }
        }
      }
    });

    const childRelationships = childFields.map(cf => ({
      childObjectApiName: cf.object.apiName,
      childLabel: cf.object.label,
      childLabelPlural: cf.object.labelPlural,
      lookupFieldApiName: cf.apiName,
    }));

    return { ...obj, childRelationships };
  }

  createObject(tenantId: string, data: {
    apiName: string; label: string; labelPlural: string;
    iconName?: string; description?: string;
  }) {
    return this.prisma.objectDef.create({ data: { tenantId, ...data, isCustom: true } });
  }

  updateObject(tenantId: string, apiName: string, data: { label?: string; labelPlural?: string; iconName?: string; description?: string }) {
    return this.prisma.objectDef.updateMany({ where: { tenantId, apiName }, data });
  }

  async removeObject(tenantId: string, apiName: string) {
    const obj = await this.prisma.objectDef.findFirst({ where: { tenantId, apiName } });
    if (!obj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Object not found' });
    if (obj.isSystem) throw new BadRequestException({ code: 'CONFLICT', message: 'Cannot delete system object' });
    await this.prisma.objectDef.delete({ where: { id: obj.id } });
    return { ok: true };
  }

  // ── Fields ────────────────────────────────────────────────────────────────

  async listFields(tenantId: string, objectApiName: string) {
    const obj = await this.prisma.objectDef.findFirst({ where: { tenantId, apiName: objectApiName } });
    if (!obj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Object not found' });
    return this.prisma.fieldDef.findMany({
      where: { objectId: obj.id },
      include: { picklist: { include: { values: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } } } },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async createField(tenantId: string, objectApiName: string, data: {
    apiName: string; label: string; type: FieldType;
    required?: boolean; unique?: boolean; defaultValue?: unknown;
    helpText?: string; picklistId?: string; referenceTo?: string;
    formulaExpr?: string; precision?: number; scale?: number;
    readPermission?: string; writePermission?: string; displayOrder?: number;
    /** Create a new Picklist + values inline (used when type=PICKLIST/MULTI_PICKLIST and picklistId is empty). */
    picklistInline?: {
      apiName?: string;
      label?: string;
      values: Array<{ value: string; label: string; color?: string; displayOrder?: number }>;
    };
  }) {
    const obj = await this.prisma.objectDef.findFirst({ where: { tenantId, apiName: objectApiName } });
    if (!obj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Object not found' });

    // For PICKLIST / MULTI_PICKLIST without picklistId but with inline values,
    // create a fresh picklist on the fly. apiName defaults to <object>_<field>.
    let picklistId = data.picklistId;
    if (!picklistId
        && (data.type === 'PICKLIST' || data.type === 'MULTI_PICKLIST')
        && data.picklistInline?.values?.length) {
      const pk = await this.prisma.picklist.create({
        data: {
          tenantId,
          apiName: data.picklistInline.apiName || `${objectApiName}_${data.apiName}`.toLowerCase(),
          label: data.picklistInline.label || data.label,
          values: {
            create: data.picklistInline.values.map((v, i) => ({
              value: v.value,
              label: v.label,
              color: v.color,
              displayOrder: v.displayOrder ?? i,
            })),
          },
        },
      });
      picklistId = pk.id;
    }

    // Strip the inline payload before passing to Prisma.
    const { picklistInline: _ignore, ...fieldData } = data;
    void _ignore;

    const created = await this.prisma.fieldDef.create({
      data: {
        tenantId,
        objectId: obj.id,
        ...fieldData,
        picklistId,
        defaultValue: data.defaultValue as object | undefined,
        isCustom: true,
      },
    });
    // Invalidate the formula-fields cache so newly added FORMULA fields show up.
    if (data.type === 'FORMULA') this.formula.invalidate(tenantId, objectApiName);
    // Wave 16a: invalidate the FLS cache when a field with read/writePermission is created.
    if (data.readPermission || data.writePermission) {
      this.fls.invalidate(tenantId, objectApiName);
    }
    return created;
  }

  async updateField(tenantId: string, fieldId: string, data: Partial<Parameters<typeof this.createField>[2]>) {
    const existing = await this.prisma.fieldDef.findFirst({
      where: { id: fieldId, tenantId },
      include: { object: { select: { apiName: true } } },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Field not found' });
    // apiName + type are immutable to preserve stored data integrity.
    // picklistInline is only valid on create.
    const { apiName: _ignoreApi, type: _ignoreType, picklistInline: _ignoreInline, ...patch } = data;
    void _ignoreApi; void _ignoreType; void _ignoreInline;
    const updated = await this.prisma.fieldDef.update({
      where: { id: fieldId },
      data: { ...patch, defaultValue: patch.defaultValue as object | undefined },
    });
    // Invalidate the formula-fields cache when the formula expression changes.
    if (existing.type === 'FORMULA' && 'formulaExpr' in patch) {
      this.formula.invalidate(tenantId, existing.object.apiName);
    }
    // Wave 16a: invalidate the FLS cache whenever read/writePermission changes.
    if ('readPermission' in patch || 'writePermission' in patch) {
      this.fls.invalidate(tenantId, existing.object.apiName);
    }
    return updated;
  }

  async removeField(tenantId: string, fieldId: string) {
    const f = await this.prisma.fieldDef.findFirst({
      where: { id: fieldId, tenantId },
      include: { object: { select: { apiName: true } } },
    });
    if (!f) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Field not found' });
    if (f.isStandard) throw new BadRequestException({ code: 'CONFLICT', message: 'Cannot delete standard field' });
    await this.prisma.fieldDef.delete({ where: { id: fieldId } });
    if (f.type === 'FORMULA') this.formula.invalidate(tenantId, f.object.apiName);
    // Wave 16a: invalidate FLS cache if this field had any read/writePermission gate.
    if (f.readPermission || f.writePermission) {
      this.fls.invalidate(tenantId, f.object.apiName);
    }
    return { ok: true };
  }

  // ── Generic ID resolver ──────────────────────────────────────────────────
  // Used by REFERENCE field renderers to turn a list of IDs into
  // human-readable names. Tenant-scoped. Returns { [id]: { name, secondary? } }.
  // Only soft-deleted records are excluded; missing IDs are simply absent.

  async resolveRecords(
    tenantId: string,
    objectApiName: string,
    ids: string[],
  ): Promise<Record<string, { name: string; secondary?: string }>> {
    if (ids.length === 0) return {};
    const out: Record<string, { name: string; secondary?: string }> = {};
    const safeIds = ids.slice(0, 200);

    // Standard objects are stored lowercase in ObjectDef.apiName, but callers
    // may pass either case. Normalize.
    switch (objectApiName.toLowerCase()) {
      case 'account': {
        const rows = await this.prisma.account.findMany({
          where: { tenantId, id: { in: safeIds }, deletedAt: null },
          select: { id: true, name: true, industry: true },
        });
        for (const r of rows) out[r.id] = { name: r.name, secondary: r.industry ?? undefined };
        break;
      }
      case 'contact': {
        const rows = await this.prisma.contact.findMany({
          where: { tenantId, id: { in: safeIds }, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, title: true },
        });
        for (const r of rows) {
          out[r.id] = {
            name: [r.firstName, r.lastName].filter(Boolean).join(' ') || '(无名)',
            secondary: r.title ?? undefined,
          };
        }
        break;
      }
      case 'lead': {
        const rows = await this.prisma.lead.findMany({
          where: { tenantId, id: { in: safeIds }, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, company: true },
        });
        for (const r of rows) {
          const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ');
          out[r.id] = {
            name: fullName || r.company,
            secondary: fullName ? r.company : undefined,
          };
        }
        break;
      }
      case 'opportunity': {
        const rows = await this.prisma.opportunity.findMany({
          where: { tenantId, id: { in: safeIds }, deletedAt: null },
          select: { id: true, name: true, stage: true },
        });
        for (const r of rows) out[r.id] = { name: r.name, secondary: r.stage };
        break;
      }
      case 'quote': {
        const rows = await this.prisma.quote.findMany({
          where: { tenantId, id: { in: safeIds }, deletedAt: null },
          select: { id: true, quoteNumber: true, status: true },
        });
        for (const r of rows) out[r.id] = { name: r.quoteNumber, secondary: r.status };
        break;
      }
      case 'order': {
        const rows = await this.prisma.order.findMany({
          where: { tenantId, id: { in: safeIds }, deletedAt: null },
          select: { id: true, orderNumber: true, status: true },
        });
        for (const r of rows) out[r.id] = { name: r.orderNumber, secondary: r.status };
        break;
      }
      case 'user': {
        const rows = await this.prisma.user.findMany({
          where: { tenantId, id: { in: safeIds }, deletedAt: null },
          select: { id: true, displayName: true, email: true },
        });
        for (const r of rows) out[r.id] = { name: r.displayName, secondary: r.email };
        break;
      }
      case 'product': {
        const rows = await this.prisma.product.findMany({
          where: { tenantId, id: { in: safeIds } },
          select: { id: true, name: true, code: true },
        });
        for (const r of rows) out[r.id] = { name: r.name, secondary: r.code };
        break;
      }
      default: {
        // Custom object — read CustomRecord, look at data.name or data.title.
        const rows = await this.prisma.customRecord.findMany({
          where: { tenantId, id: { in: safeIds }, objectApiName },
          select: { id: true, data: true },
        });
        for (const r of rows) {
          const d = (r.data as Record<string, unknown>) ?? {};
          out[r.id] = {
            name: String(d.name ?? d.title ?? d.label ?? r.id),
          };
        }
        break;
      }
    }
    return out;
  }

  // ── Picklists ─────────────────────────────────────────────────────────────

  listPicklists(tenantId: string) {
    return this.prisma.picklist.findMany({
      where: { tenantId },
      include: { values: { orderBy: { displayOrder: 'asc' } }, _count: { select: { fields: true } } },
    });
  }

  getPicklist(tenantId: string, apiName: string) {
    return this.prisma.picklist.findFirstOrThrow({
      where: { tenantId, apiName },
      include: { values: { orderBy: { displayOrder: 'asc' } } },
    });
  }

  createPicklist(tenantId: string, data: {
    apiName: string; label: string; description?: string;
    values: Array<{ value: string; label: string; isDefault?: boolean; color?: string; displayOrder?: number }>;
  }) {
    return this.prisma.picklist.create({
      data: {
        tenantId,
        apiName: data.apiName,
        label: data.label,
        description: data.description,
        values: { create: data.values },
      },
      include: { values: true },
    });
  }

  async upsertPicklistValues(tenantId: string, picklistId: string, values: Array<{ value: string; label: string; isDefault?: boolean; isActive?: boolean; color?: string; displayOrder?: number }>) {
    const p = await this.prisma.picklist.findFirst({ where: { id: picklistId, tenantId } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Picklist not found' });
    // Remove old, add new (simplest approach for now)
    await this.prisma.picklistValue.deleteMany({ where: { picklistId } });
    await this.prisma.picklistValue.createMany({ data: values.map((v) => ({ picklistId, ...v })) });
    return this.prisma.picklist.findUnique({ where: { id: picklistId }, include: { values: true } });
  }

  // ── Page Layouts (stored in ObjectDef.customData.layout) ──────────────────

  async getLayout(tenantId: string, apiName: string) {
    const obj = await this.prisma.objectDef.findFirst({
      where: { tenantId, apiName },
      select: { id: true, apiName: true, layoutJson: true },
    });
    if (!obj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Object not found' });
    return { layout: obj.layoutJson ?? null };
  }

  async saveLayout(tenantId: string, apiName: string, sections: unknown[]) {
    const obj = await this.prisma.objectDef.findFirst({ where: { tenantId, apiName } });
    if (!obj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Object not found' });
    await this.prisma.objectDef.update({
      where: { id: obj.id },
      data: { layoutJson: sections as object[] },
    });
    return { layout: sections };
  }
}
