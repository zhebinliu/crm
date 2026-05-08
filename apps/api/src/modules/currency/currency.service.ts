// ── CurrencyService ──────────────────────────────────────────────────────
// Multi-currency exchange rates + auto-conversion to a tenant's "corporate"
// reporting currency (Wave 19g).
//
// Resolution rules:
//   • An effective rate is one whose effectiveFrom ≤ asOf and either
//     effectiveTo is null or effectiveTo > asOf.
//   • If the (from,to) pair has no effective row, try the inverse (to,from)
//     and return 1/rate.
//   • If still missing, log a warning and return null. Auto-conversion never
//     throws — the caller stores `convertedAmount = null` instead.
//
// `convertToCorporate` reads `Tenant.settings.corporateCurrency` (Json column);
// when the field is missing or non-string, it defaults to "CNY".
//
// `applyAfterSave` is called fire-and-forget by Opportunity / Quote / Order
// services after a row is written; failures are swallowed and logged.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';

export type ConvertibleEntity = 'opportunity' | 'quote' | 'order';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Rate CRUD ───────────────────────────────────────────────────────────

  listRates(
    tenantId: string,
    filter: { from?: string; to?: string } = {},
  ) {
    return this.prisma.currencyRate.findMany({
      where: {
        tenantId,
        ...(filter.from ? { fromCurrency: filter.from.toUpperCase() } : {}),
        ...(filter.to ? { toCurrency: filter.to.toUpperCase() } : {}),
      },
      orderBy: [{ fromCurrency: 'asc' }, { toCurrency: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  createRate(
    tenantId: string,
    data: {
      fromCurrency: string;
      toCurrency: string;
      rate: number | string;
      effectiveFrom: string | Date;
      effectiveTo?: string | Date | null;
      source?: string;
    },
  ) {
    return this.prisma.currencyRate.create({
      data: {
        tenantId,
        fromCurrency: data.fromCurrency.toUpperCase(),
        toCurrency: data.toCurrency.toUpperCase(),
        rate: new Decimal(data.rate),
        effectiveFrom: new Date(data.effectiveFrom),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        source: data.source ?? 'manual',
      },
    });
  }

  async updateRate(
    tenantId: string,
    id: string,
    patch: Partial<{
      rate: number | string;
      effectiveFrom: string | Date;
      effectiveTo: string | Date | null;
      source: string;
    }>,
  ) {
    const existing = await this.prisma.currencyRate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Rate not found' });
    return this.prisma.currencyRate.update({
      where: { id },
      data: {
        ...(patch.rate !== undefined ? { rate: new Decimal(patch.rate) } : {}),
        ...(patch.effectiveFrom ? { effectiveFrom: new Date(patch.effectiveFrom) } : {}),
        ...(patch.effectiveTo !== undefined
          ? { effectiveTo: patch.effectiveTo ? new Date(patch.effectiveTo) : null }
          : {}),
        ...(patch.source ? { source: patch.source } : {}),
      },
    });
  }

  async deleteRate(tenantId: string, id: string) {
    const existing = await this.prisma.currencyRate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Rate not found' });
    await this.prisma.currencyRate.delete({ where: { id } });
    return { ok: true };
  }

  // ── Lookup + conversion ────────────────────────────────────────────────

  /**
   * Find the rate to convert one unit of `from` into `to` at `asOf`.
   * Falls back to the inverse pair when the direct row is missing.
   * Returns `null` when neither is available.
   */
  async getRate(
    tenantId: string,
    from: string,
    to: string,
    asOf: Date = new Date(),
  ): Promise<number | null> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return 1;

    const direct = await this.findEffectiveRow(tenantId, f, t, asOf);
    if (direct) return Number(direct.rate);

    const inverse = await this.findEffectiveRow(tenantId, t, f, asOf);
    if (inverse) {
      const inv = Number(inverse.rate);
      if (inv > 0) return 1 / inv;
    }

    this.logger.warn(`No rate ${f}→${t} for tenant ${tenantId} at ${asOf.toISOString()}`);
    return null;
  }

  /**
   * Convert an amount, returning a Decimal scaled to 2 places (the column
   * scale on Opp/Quote/Order). Returns null when no rate is available.
   */
  async convert(
    tenantId: string,
    amount: Decimal | number | string | null | undefined,
    from: string,
    to: string,
    asOf: Date = new Date(),
  ): Promise<Decimal | null> {
    if (amount === null || amount === undefined) return null;
    const rate = await this.getRate(tenantId, from, to, asOf);
    if (rate === null) return null;
    const dec = amount instanceof Decimal ? amount : new Decimal(amount);
    return dec.mul(new Decimal(rate)).toDecimalPlaces(2);
  }

  /** Converts to the tenant's corporate currency (defaults to CNY). */
  async convertToCorporate(
    tenantId: string,
    amount: Decimal | number | string | null | undefined,
    from: string,
    asOf: Date = new Date(),
  ): Promise<{ amount: Decimal | null; corporate: string }> {
    const corporate = await this.getCorporateCurrency(tenantId);
    if (from.toUpperCase() === corporate) {
      const dec = amount === null || amount === undefined
        ? null
        : amount instanceof Decimal ? amount : new Decimal(amount);
      return { amount: dec ? dec.toDecimalPlaces(2) : null, corporate };
    }
    const converted = await this.convert(tenantId, amount, from, corporate, asOf);
    return { amount: converted, corporate };
  }

  async getCorporateCurrency(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings as Record<string, unknown> | null) ?? null;
    const cc = settings && typeof settings['corporateCurrency'] === 'string'
      ? (settings['corporateCurrency'] as string).toUpperCase()
      : 'CNY';
    return cc;
  }

  // ── Auto-conversion hook ───────────────────────────────────────────────

  /**
   * Fire-and-forget — recompute `convertedAmount` for one Opp/Quote/Order
   * after it's been written. Logs warnings instead of throwing.
   */
  async applyAfterSave(
    entity: ConvertibleEntity,
    tenantId: string,
    recordId: string,
  ): Promise<void> {
    try {
      const corporate = await this.getCorporateCurrency(tenantId);
      const { record, amount, currency } = await this.fetchAmount(entity, tenantId, recordId);
      if (!record) return;
      if (!currency || currency.toUpperCase() === corporate) {
        // Same currency → mirror the amount directly so reports never see
        // null on records that don't need conversion.
        await this.writeConverted(entity, recordId, amount ?? null);
        return;
      }
      const result = await this.convert(tenantId, amount, currency, corporate);
      await this.writeConverted(entity, recordId, result);
    } catch (err) {
      this.logger.warn(
        `convertedAmount failed for ${entity}/${recordId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Bulk recompute convertedAmount across all Opps / Quotes / Orders.
   * Returns the count actually updated. Used by the
   * `POST /admin/currency-rates/recompute` endpoint after rate edits.
   */
  async recomputeAll(tenantId: string): Promise<{ opportunities: number; quotes: number; orders: number }> {
    const corporate = await this.getCorporateCurrency(tenantId);
    let opportunities = 0;
    let quotes = 0;
    let orders = 0;

    const opps = await this.prisma.opportunity.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, amount: true, currencyCode: true },
    });
    for (const o of opps) {
      const next = await this.computeFor(tenantId, o.amount, o.currencyCode, corporate);
      await this.prisma.opportunity.update({ where: { id: o.id }, data: { convertedAmount: next } });
      opportunities++;
    }

    const qs = await this.prisma.quote.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, grandTotal: true, currencyCode: true },
    });
    for (const q of qs) {
      const next = await this.computeFor(tenantId, q.grandTotal, q.currencyCode, corporate);
      await this.prisma.quote.update({ where: { id: q.id }, data: { convertedAmount: next } });
      quotes++;
    }

    const ords = await this.prisma.order.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, grandTotal: true, currencyCode: true },
    });
    for (const o of ords) {
      const next = await this.computeFor(tenantId, o.grandTotal, o.currencyCode, corporate);
      await this.prisma.order.update({ where: { id: o.id }, data: { convertedAmount: next } });
      orders++;
    }

    return { opportunities, quotes, orders };
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private async findEffectiveRow(
    tenantId: string,
    from: string,
    to: string,
    asOf: Date,
  ) {
    return this.prisma.currencyRate.findFirst({
      where: {
        tenantId,
        fromCurrency: from,
        toCurrency: to,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  private async fetchAmount(
    entity: ConvertibleEntity,
    tenantId: string,
    recordId: string,
  ): Promise<{ record: unknown; amount: Decimal | null; currency: string | null }> {
    if (entity === 'opportunity') {
      const r = await this.prisma.opportunity.findFirst({
        where: { id: recordId, tenantId },
        select: { id: true, amount: true, currencyCode: true },
      });
      return { record: r, amount: r?.amount ?? null, currency: r?.currencyCode ?? null };
    }
    if (entity === 'quote') {
      const r = await this.prisma.quote.findFirst({
        where: { id: recordId, tenantId },
        select: { id: true, grandTotal: true, currencyCode: true },
      });
      return { record: r, amount: r?.grandTotal ?? null, currency: r?.currencyCode ?? null };
    }
    const r = await this.prisma.order.findFirst({
      where: { id: recordId, tenantId },
      select: { id: true, grandTotal: true, currencyCode: true },
    });
    return { record: r, amount: r?.grandTotal ?? null, currency: r?.currencyCode ?? null };
  }

  private async writeConverted(
    entity: ConvertibleEntity,
    recordId: string,
    amount: Decimal | null,
  ): Promise<void> {
    if (entity === 'opportunity') {
      await this.prisma.opportunity.update({ where: { id: recordId }, data: { convertedAmount: amount } });
    } else if (entity === 'quote') {
      await this.prisma.quote.update({ where: { id: recordId }, data: { convertedAmount: amount } });
    } else {
      await this.prisma.order.update({ where: { id: recordId }, data: { convertedAmount: amount } });
    }
  }

  private async computeFor(
    tenantId: string,
    amount: Decimal | null,
    currency: string,
    corporate: string,
  ): Promise<Decimal | null> {
    if (amount === null) return null;
    if (currency.toUpperCase() === corporate) return amount.toDecimalPlaces(2);
    return this.convert(tenantId, amount, currency, corporate);
  }
}
