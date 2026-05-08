// ── TranslationService ───────────────────────────────────────────────────
// Per-tenant locale overrides for ObjectDef / FieldDef / Picklist /
// PicklistValue labels. Existing label columns store the canonical Chinese
// label; this table holds optional overrides for additional locales.
//
// Caching: results are memoized for 60s per (tenantId, locale) so a single
// metadata read with translation applied costs at most one DB round trip
// per minute, regardless of how many fields/picklists are on the object.
//
// `applyToObject` mutates the object def in place — when a translation
// exists for a given (entityType, entityId) it overrides label / description
// / helpText. Missing locales fall back to the canonical column.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type EntityType = 'object' | 'field' | 'picklist' | 'picklist_value';

interface Translation {
  label: string | null;
  description: string | null;
  helpText: string | null;
}

interface CacheEntry {
  // key = `${entityType}:${entityId}`
  map: Map<string, Translation>;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class TranslationService {
  constructor(private readonly prisma: PrismaService) {}

  /** key = `${tenantId}|${locale}` */
  private cache = new Map<string, CacheEntry>();

  // ── Reads ───────────────────────────────────────────────────────────────

  async translate(
    tenantId: string,
    entityType: EntityType,
    entityId: string,
    locale: string,
  ): Promise<Translation | null> {
    const map = await this.loadLocale(tenantId, locale);
    return map.get(`${entityType}:${entityId}`) ?? null;
  }

  async translateMany(
    tenantId: string,
    entries: Array<{ type: EntityType; id: string }>,
    locale: string,
  ): Promise<Map<string, Translation>> {
    const map = await this.loadLocale(tenantId, locale);
    const out = new Map<string, Translation>();
    for (const e of entries) {
      const key = `${e.type}:${e.id}`;
      const t = map.get(key);
      if (t) out.set(key, t);
    }
    return out;
  }

  /**
   * Mutates `objDef` in place, replacing label/description (and helpText
   * on fields) with locale overrides where present. Recurses into fields,
   * each field's picklist, and each picklist value.
   */
  async applyToObject(
    tenantId: string,
    objDef: Record<string, unknown>,
    locale: string,
  ): Promise<void> {
    const map = await this.loadLocale(tenantId, locale);

    const apply = (
      type: EntityType,
      target: Record<string, unknown> | null | undefined,
    ) => {
      if (!target) return;
      const id = target['id'] as string | undefined;
      if (!id) return;
      const tr = map.get(`${type}:${id}`);
      if (!tr) return;
      if (tr.label) target['label'] = tr.label;
      if (tr.description) target['description'] = tr.description;
      if (tr.helpText && 'helpText' in target) target['helpText'] = tr.helpText;
    };

    apply('object', objDef);

    const fields = (objDef['fields'] as Array<Record<string, unknown>> | undefined) ?? [];
    for (const f of fields) {
      apply('field', f);
      const pl = f['picklist'] as Record<string, unknown> | undefined;
      if (pl) {
        apply('picklist', pl);
        const values = (pl['values'] as Array<Record<string, unknown>> | undefined) ?? [];
        for (const v of values) apply('picklist_value', v);
      }
    }
  }

  // ── Writes (admin) ──────────────────────────────────────────────────────

  list(
    tenantId: string,
    filter: { entityType?: EntityType; locale?: string } = {},
  ) {
    return this.prisma.labelTranslation.findMany({
      where: {
        tenantId,
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
        ...(filter.locale ? { locale: filter.locale } : {}),
      },
      orderBy: [{ entityType: 'asc' }, { locale: 'asc' }, { entityId: 'asc' }],
    });
  }

  async upsert(
    tenantId: string,
    entityType: EntityType,
    entityId: string,
    locale: string,
    data: { label?: string | null; description?: string | null; helpText?: string | null },
  ) {
    const row = await this.prisma.labelTranslation.upsert({
      where: {
        tenantId_entityType_entityId_locale: { tenantId, entityType, entityId, locale },
      },
      update: {
        label: data.label ?? null,
        description: data.description ?? null,
        helpText: data.helpText ?? null,
      },
      create: {
        tenantId,
        entityType,
        entityId,
        locale,
        label: data.label ?? null,
        description: data.description ?? null,
        helpText: data.helpText ?? null,
      },
    });
    this.invalidate(tenantId, locale);
    return row;
  }

  async remove(
    tenantId: string,
    entityType: EntityType,
    entityId: string,
    locale: string,
  ) {
    const existing = await this.prisma.labelTranslation.findUnique({
      where: {
        tenantId_entityType_entityId_locale: { tenantId, entityType, entityId, locale },
      },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Translation not found' });
    await this.prisma.labelTranslation.delete({ where: { id: existing.id } });
    this.invalidate(tenantId, locale);
    return { ok: true };
  }

  invalidate(tenantId: string, locale?: string) {
    if (!locale) {
      for (const key of Array.from(this.cache.keys())) {
        if (key.startsWith(`${tenantId}|`)) this.cache.delete(key);
      }
      return;
    }
    this.cache.delete(`${tenantId}|${locale}`);
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private async loadLocale(tenantId: string, locale: string): Promise<Map<string, Translation>> {
    const key = `${tenantId}|${locale}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.map;

    const rows = await this.prisma.labelTranslation.findMany({
      where: { tenantId, locale },
      select: { entityType: true, entityId: true, label: true, description: true, helpText: true },
    });
    const map = new Map<string, Translation>();
    for (const r of rows) {
      map.set(`${r.entityType}:${r.entityId}`, {
        label: r.label,
        description: r.description,
        helpText: r.helpText,
      });
    }
    this.cache.set(key, { map, expiresAt: now + CACHE_TTL_MS });
    return map;
  }
}
