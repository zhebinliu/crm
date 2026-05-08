import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Wave 19b — Real Page Layout engine.
 *
 * A PageLayout is a structured, renderable description of how a record
 * detail page should be laid out: an ordered array of sections, related-
 * lists, and rich-text blocks. It supersedes ObjectDef.layoutJson, which
 * we keep around for backward compat.
 *
 * Resolution rule (UI calls /resolve to pick the right layout):
 *   1. RecordType.layoutId, when an RT has been chosen on the record.
 *   2. The "default" PageLayout for the object (apiName="default").
 *   3. An auto-generated single-section layout containing every active
 *      FieldDef on the object — so brand-new tenants render something
 *      useful before an admin opens the editor.
 */
@Injectable()
export class PageLayoutService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────

  list(tenantId: string, objectApiName?: string) {
    return this.prisma.pageLayout.findMany({
      where: { tenantId, ...(objectApiName ? { objectApiName } : {}) },
      orderBy: [{ objectApiName: 'asc' }, { apiName: 'asc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const layout = await this.prisma.pageLayout.findFirst({
      where: { id, tenantId },
      include: { recordTypes: { select: { id: true, apiName: true, label: true } } },
    });
    if (!layout) throw new NotFoundException({ code: 'NOT_FOUND', message: 'PageLayout not found' });
    return layout;
  }

  create(tenantId: string, objectApiName: string, data: {
    apiName: string; label: string;
    sections?: unknown[];
    isActive?: boolean;
  }) {
    if (!data.apiName) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'apiName required' });
    if (!data.label) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'label required' });
    return this.prisma.pageLayout.create({
      data: {
        tenantId,
        objectApiName,
        apiName: data.apiName,
        label: data.label,
        sections: (data.sections ?? []) as object[],
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, data: {
    label?: string; sections?: unknown[]; isActive?: boolean;
  }) {
    const existing = await this.prisma.pageLayout.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'PageLayout not found' });
    return this.prisma.pageLayout.update({
      where: { id },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.sections !== undefined ? { sections: data.sections as object[] } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.pageLayout.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'PageLayout not found' });
    await this.prisma.pageLayout.delete({ where: { id } });
    return { ok: true };
  }

  // ── Resolve ──────────────────────────────────────────────────────────────

  /**
   * Pick the layout to render for a given (object, RecordType?) pair.
   * Falls back through: RT.layoutId → object's "default" layout →
   * auto-generated all-fields layout (so we never return null).
   */
  async resolve(
    tenantId: string,
    objectApiName: string,
    recordTypeId?: string | null,
  ): Promise<{
    source: 'record-type' | 'default' | 'auto';
    layout: {
      id: string | null;
      apiName: string;
      label: string;
      sections: unknown[];
    };
  }> {
    // 1. RT-pinned layout
    if (recordTypeId) {
      const rt = await this.prisma.recordType.findFirst({
        where: { id: recordTypeId, tenantId },
        include: { layout: true },
      });
      if (rt?.layout) {
        return {
          source: 'record-type',
          layout: {
            id: rt.layout.id,
            apiName: rt.layout.apiName,
            label: rt.layout.label,
            sections: (rt.layout.sections as unknown[]) ?? [],
          },
        };
      }
    }

    // 2. Object-level default layout (apiName="default")
    const def = await this.prisma.pageLayout.findFirst({
      where: { tenantId, objectApiName, apiName: 'default', isActive: true },
    });
    if (def) {
      return {
        source: 'default',
        layout: {
          id: def.id,
          apiName: def.apiName,
          label: def.label,
          sections: (def.sections as unknown[]) ?? [],
        },
      };
    }

    // 3. Auto-generated layout from FieldDef rows. Two-column grid, paired
    //    fields per row in displayOrder.
    const obj = await this.prisma.objectDef.findFirst({
      where: { tenantId, apiName: objectApiName },
      include: {
        fields: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          select: { apiName: true, label: true, required: true },
        },
      },
    });
    const fields = obj?.fields ?? [];
    const rows: Array<{ fields: Array<{ apiName: string; required: boolean; label: string }> }> = [];
    for (let i = 0; i < fields.length; i += 2) {
      rows.push({
        fields: fields.slice(i, i + 2).map((f) => ({
          apiName: f.apiName,
          label: f.label,
          required: f.required,
        })),
      });
    }
    return {
      source: 'auto',
      layout: {
        id: null,
        apiName: 'auto',
        label: obj?.label ?? objectApiName,
        sections: [
          {
            type: 'section',
            title: 'Information',
            columns: 2,
            rows,
          },
        ],
      },
    };
  }
}
