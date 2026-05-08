import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';

export type DiscountSource = 'tier' | 'rule' | 'manual' | 'none';

export interface PriceLineResult {
  productId: string;
  quantity: Decimal;
  /** Catalog list price from the price book (pre-discount). */
  listPrice: Decimal;
  /** Effective unit price after applying tier/rule/manual discount. */
  unitPrice: Decimal;
  /** Discount expressed as a percentage 0..100 (informational). */
  discount: Decimal;
  discountSource: DiscountSource;
  appliedTierId?: string;
  /** Currency code carried through from the price book entry. */
  currencyCode: string;
}

export interface PriceLineOptions {
  currencyCode?: string;
  /** Optional manual discount percent (0..100); when set wins over tiers. */
  manualDiscountPercent?: number;
  /** Optional explicit unit price override (manual). When set wins over tiers. */
  manualUnitPrice?: number;
}

export interface QuoteRepriceSummary {
  quoteId: string;
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  shippingAmount: Decimal;
  grandTotal: Decimal;
  lines: Array<{
    id: string;
    productId: string;
    quantity: Decimal;
    listPrice: Decimal;
    unitPrice: Decimal;
    discount: Decimal;
    discountSource: DiscountSource;
    subtotal: Decimal;
  }>;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the effective unit price for a given product/quantity.
   *
   * Algorithm:
   *   1. List price = PriceBookEntry.unitPrice (priceBookId fallback to standard book).
   *   2. Manual override (unit price OR discount %) wins → discountSource: 'manual'.
   *   3. Otherwise look up the highest-minQuantity active PriceTier whose minQuantity ≤ qty,
   *      preferring a tier scoped to the same price book over a global one. Apply its
   *      `unitPrice` (if set) or `discountPercent`. → discountSource: 'tier'.
   *   4. No tier? Return the list price unchanged → discountSource: 'none'.
   */
  async priceLine(
    tenantId: string,
    productId: string,
    quantity: number,
    priceBookId?: string,
    opts: PriceLineOptions = {},
  ): Promise<PriceLineResult> {
    if (quantity <= 0) {
      throw new NotFoundException('quantity must be > 0');
    }
    const qty = new Decimal(quantity);

    // 1. Determine list price
    const { entry, priceBook } = await this.resolveListPrice(
      tenantId,
      productId,
      priceBookId,
      opts.currencyCode,
    );

    const listPrice = entry?.unitPrice ?? new Decimal(0);
    const currencyCode = entry?.currencyCode ?? opts.currencyCode ?? 'CNY';

    // 2. Manual override
    if (opts.manualUnitPrice !== undefined) {
      const manualPrice = new Decimal(opts.manualUnitPrice);
      const discountPct = listPrice.gt(0)
        ? new Decimal(1).minus(manualPrice.div(listPrice)).mul(100)
        : new Decimal(0);
      return {
        productId,
        quantity: qty,
        listPrice,
        unitPrice: manualPrice,
        discount: discountPct,
        discountSource: 'manual',
        currencyCode,
      };
    }
    if (opts.manualDiscountPercent !== undefined) {
      const discountPct = new Decimal(opts.manualDiscountPercent);
      const unitPrice = listPrice.mul(new Decimal(1).minus(discountPct.div(100)));
      return {
        productId,
        quantity: qty,
        listPrice,
        unitPrice,
        discount: discountPct,
        discountSource: 'manual',
        currencyCode,
      };
    }

    // 3. Tier resolution
    const tier = await this.findApplicableTier(tenantId, productId, qty, priceBook?.id);
    if (tier) {
      let unitPrice: Decimal;
      let discountPct: Decimal;
      if (tier.unitPrice !== null && tier.unitPrice !== undefined) {
        unitPrice = tier.unitPrice;
        discountPct = listPrice.gt(0)
          ? new Decimal(1).minus(unitPrice.div(listPrice)).mul(100)
          : new Decimal(0);
      } else {
        discountPct = tier.discountPercent ?? new Decimal(0);
        unitPrice = listPrice.mul(new Decimal(1).minus(discountPct.div(100)));
      }
      return {
        productId,
        quantity: qty,
        listPrice,
        unitPrice,
        discount: discountPct,
        discountSource: 'tier',
        appliedTierId: tier.id,
        currencyCode,
      };
    }

    // 4. No discount
    return {
      productId,
      quantity: qty,
      listPrice,
      unitPrice: listPrice,
      discount: new Decimal(0),
      discountSource: 'none',
      currencyCode,
    };
  }

  /**
   * Recompute every QuoteLineItem's unit price + subtotal, then update the
   * Quote's subtotal/discount/tax/grandTotal. Returns a summary.
   *
   * Manual line-level discounts (QuoteLineItem.discount > 0) are treated as
   * the user's intent and preserved — tier discounts only fire on lines
   * that have no manual discount.
   */
  async priceQuote(tenantId: string, quoteId: string): Promise<QuoteRepriceSummary> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
      include: { lineItems: true },
    });
    if (!quote) throw new NotFoundException(`Quote ${quoteId} not found`);

    // Quotes don't currently link a priceBook; pass undefined → standard book.
    const priceBookId: string | undefined = undefined;

    const lines: QuoteRepriceSummary['lines'] = [];
    let subtotal = new Decimal(0);
    let taxAmount = new Decimal(0);

    for (const li of quote.lineItems) {
      const manualDiscount = li.discount?.gt(0) ? Number(li.discount) : undefined;
      const result = await this.priceLine(
        tenantId,
        li.productId,
        Number(li.quantity),
        priceBookId,
        { manualDiscountPercent: manualDiscount, currencyCode: quote.currencyCode },
      );
      const lineSubtotal = result.unitPrice.mul(li.quantity);
      const lineTax = lineSubtotal.mul(li.taxRate ?? new Decimal(0)).div(100);

      await this.prisma.quoteLineItem.update({
        where: { id: li.id },
        data: {
          unitPrice: result.unitPrice,
          // Persist the resolved discount % so reports show it; manual lines
          // already had this set, tier lines now reflect their tier's effect.
          discount: result.discount,
          subtotal: lineSubtotal,
        },
      });

      lines.push({
        id: li.id,
        productId: li.productId,
        quantity: li.quantity,
        listPrice: result.listPrice,
        unitPrice: result.unitPrice,
        discount: result.discount,
        discountSource: result.discountSource,
        subtotal: lineSubtotal,
      });

      subtotal = subtotal.plus(lineSubtotal);
      taxAmount = taxAmount.plus(lineTax);
    }

    const discountAmount = quote.discountAmount ?? new Decimal(0);
    const shippingAmount = quote.shippingAmount ?? new Decimal(0);
    const grandTotal = subtotal.minus(discountAmount).plus(taxAmount).plus(shippingAmount);

    await this.prisma.quote.update({
      where: { id: quoteId },
      data: { subtotal, taxAmount, grandTotal },
    });

    return {
      quoteId,
      subtotal,
      discountAmount,
      taxAmount,
      shippingAmount,
      grandTotal,
      lines,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async resolveListPrice(
    tenantId: string,
    productId: string,
    priceBookId?: string,
    currencyCode?: string,
  ) {
    const where: { productId: string; isActive: boolean; priceBookId?: string; currencyCode?: string } = {
      productId,
      isActive: true,
    };
    if (currencyCode) where.currencyCode = currencyCode;

    let priceBook = priceBookId
      ? await this.prisma.priceBook.findFirst({ where: { id: priceBookId, tenantId } })
      : null;

    if (priceBook) {
      where.priceBookId = priceBook.id;
      const entry = await this.prisma.priceBookEntry.findFirst({ where });
      if (entry) return { entry, priceBook };
    }

    // Fallback to standard
    priceBook = await this.prisma.priceBook.findFirst({
      where: { tenantId, isStandard: true },
    });
    if (priceBook) {
      const entry = await this.prisma.priceBookEntry.findFirst({
        where: { ...where, priceBookId: priceBook.id },
      });
      if (entry) return { entry, priceBook };
    }

    // Last resort: any active entry for this product within tenant
    const entry = await this.prisma.priceBookEntry.findFirst({
      where: { productId, isActive: true, priceBook: { tenantId } },
    });
    return { entry, priceBook };
  }

  private async findApplicableTier(
    tenantId: string,
    productId: string,
    quantity: Decimal,
    priceBookId?: string,
  ) {
    // Prefer book-scoped tiers over global ones.
    if (priceBookId) {
      const scoped = await this.prisma.priceTier.findFirst({
        where: {
          tenantId,
          productId,
          isActive: true,
          priceBookId,
          minQuantity: { lte: quantity },
        },
        orderBy: { minQuantity: 'desc' },
      });
      if (scoped) return scoped;
    }
    return this.prisma.priceTier.findFirst({
      where: {
        tenantId,
        productId,
        isActive: true,
        priceBookId: null,
        minQuantity: { lte: quantity },
      },
      orderBy: { minQuantity: 'desc' },
    });
  }
}
