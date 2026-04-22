import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldType } from '@prisma/client';

@Injectable()
export class MetadataService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Objects ───────────────────────────────────────────────────────────────

  listObjects(tenantId: string) {
    return this.prisma.objectDef.findMany({
      where: { tenantId },
      include: { _count: { select: { fields: true } } },
      orderBy: { apiName: 'asc' },
    });
  }

  async getObject(tenantId: string, apiName: string) {
    const obj = await this.prisma.objectDef.findFirstOrThrow({
      where: { tenantId, apiName },
      include: { fields: { orderBy: { displayOrder: 'asc' } } },
    });

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
  }) {
    const obj = await this.prisma.objectDef.findFirst({ where: { tenantId, apiName: objectApiName } });
    if (!obj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Object not found' });
    return this.prisma.fieldDef.create({
      data: {
        tenantId,
        objectId: obj.id,
        ...data,
        defaultValue: data.defaultValue as object | undefined,
        isCustom: true,
      },
    });
  }

  updateField(tenantId: string, fieldId: string, data: Partial<Parameters<typeof this.createField>[2]>) {
    return this.prisma.fieldDef.update({
      where: { id: fieldId },
      data: { ...data, defaultValue: data.defaultValue as object | undefined },
    });
  }

  async removeField(tenantId: string, fieldId: string) {
    const f = await this.prisma.fieldDef.findFirst({ where: { id: fieldId, tenantId } });
    if (!f) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Field not found' });
    if (f.isStandard) throw new BadRequestException({ code: 'CONFLICT', message: 'Cannot delete standard field' });
    await this.prisma.fieldDef.delete({ where: { id: fieldId } });
    return { ok: true };
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
