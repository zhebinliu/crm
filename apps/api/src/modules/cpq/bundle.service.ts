import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface CreateBundleInput {
  productId: string;
  type?: string;
  fixedPrice?: boolean;
}

export interface UpdateBundleInput {
  type?: string;
  fixedPrice?: boolean;
}

export interface CreateBundleItemInput {
  childProductId: string;
  required?: boolean;
  defaultQuantity?: number;
  minQuantity?: number;
  maxQuantity?: number | null;
  displayOrder?: number;
}

export interface UpdateBundleItemInput {
  required?: boolean;
  defaultQuantity?: number;
  minQuantity?: number;
  maxQuantity?: number | null;
  displayOrder?: number;
}

export interface BundleCustomization {
  /** child product id => override quantity (skip → use default; 0 → drop optional). */
  childProductId: string;
  quantity?: number;
  /** explicitly drop an optional child. */
  include?: boolean;
}

export interface ExpandedBundleLine {
  productId: string;
  /** True for the bundle's wrapper product, false for child rows. */
  isBundleParent: boolean;
  bundleId: string;
  quantity: Decimal;
  unitPrice: Decimal;
  required: boolean;
  description?: string;
}

@Injectable()
export class BundleService {
  constructor(private readonly prisma: PrismaService) {}

  // ── ProductBundle CRUD ───────────────────────────────────────────────────

  list(tenantId: string) {
    return this.prisma.productBundle.findMany({
      where: { tenantId },
      include: {
        product: true,
        items: {
          include: { childProduct: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(tenantId: string, id: string) {
    const bundle = await this.prisma.productBundle.findFirst({
      where: { id, tenantId },
      include: {
        product: true,
        items: {
          include: { childProduct: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });
    if (!bundle) throw new NotFoundException(`Bundle ${id} not found`);
    return bundle;
  }

  async create(tenantId: string, input: CreateBundleInput) {
    // Validate parent product belongs to tenant
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, tenantId, deletedAt: null },
    });
    if (!product) throw new NotFoundException(`Product ${input.productId} not found`);

    return this.prisma.productBundle.create({
      data: {
        tenantId,
        productId: input.productId,
        type: input.type ?? 'configurable',
        fixedPrice: input.fixedPrice ?? false,
      },
      include: { product: true, items: true },
    });
  }

  async update(tenantId: string, id: string, input: UpdateBundleInput) {
    await this.get(tenantId, id);
    return this.prisma.productBundle.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.fixedPrice !== undefined ? { fixedPrice: input.fixedPrice } : {}),
      },
      include: { product: true, items: true },
    });
  }

  async delete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.productBundle.delete({ where: { id } });
  }

  // ── BundleItem CRUD ──────────────────────────────────────────────────────

  async addItem(tenantId: string, bundleId: string, input: CreateBundleItemInput) {
    const bundle = await this.get(tenantId, bundleId);

    const child = await this.prisma.product.findFirst({
      where: { id: input.childProductId, tenantId, deletedAt: null },
    });
    if (!child) throw new NotFoundException(`Child product ${input.childProductId} not found`);
    if (child.id === bundle.productId) {
      throw new BadRequestException('A bundle cannot contain its own parent product as a child');
    }

    const defaultQty = new Decimal(input.defaultQuantity ?? 1);
    const minQty = new Decimal(input.minQuantity ?? 1);
    const maxQty =
      input.maxQuantity === undefined || input.maxQuantity === null
        ? null
        : new Decimal(input.maxQuantity);

    if (maxQty && maxQty.lt(minQty)) {
      throw new BadRequestException('maxQuantity must be ≥ minQuantity');
    }

    return this.prisma.bundleItem.create({
      data: {
        bundleId,
        childProductId: input.childProductId,
        required: input.required ?? true,
        defaultQuantity: defaultQty,
        minQuantity: minQty,
        maxQuantity: maxQty,
        displayOrder: input.displayOrder ?? 0,
      },
      include: { childProduct: true },
    });
  }

  async updateItem(tenantId: string, bundleId: string, itemId: string, input: UpdateBundleItemInput) {
    await this.get(tenantId, bundleId);
    const existing = await this.prisma.bundleItem.findFirst({ where: { id: itemId, bundleId } });
    if (!existing) throw new NotFoundException(`BundleItem ${itemId} not found`);

    return this.prisma.bundleItem.update({
      where: { id: itemId },
      data: {
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.defaultQuantity !== undefined
          ? { defaultQuantity: new Decimal(input.defaultQuantity) }
          : {}),
        ...(input.minQuantity !== undefined ? { minQuantity: new Decimal(input.minQuantity) } : {}),
        ...(input.maxQuantity !== undefined
          ? { maxQuantity: input.maxQuantity === null ? null : new Decimal(input.maxQuantity) }
          : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      },
      include: { childProduct: true },
    });
  }

  async removeItem(tenantId: string, bundleId: string, itemId: string) {
    await this.get(tenantId, bundleId);
    const result = await this.prisma.bundleItem.deleteMany({ where: { id: itemId, bundleId } });
    if (result.count === 0) throw new NotFoundException(`BundleItem ${itemId} not found`);
  }

  // ── Expansion ────────────────────────────────────────────────────────────

  /**
   * Flatten a bundle into the line items that should be added to a quote.
   *
   * Rules:
   * - Parent bundle row is always included once (qty = bundleQuantity).
   * - Required children are always included (qty defaultQuantity * bundleQuantity).
   * - Optional children may be skipped via customizations[i].include === false.
   * - Customization quantity (per-bundle) replaces defaultQuantity, then is
   *   multiplied by bundleQuantity.
   * - all_or_nothing bundles: customizations cannot drop required items
   *   (already enforced) and cannot drop optional items either.
   * - Quantities are clamped to [min, max].
   *
   * Pricing here uses each product's PriceBookEntry from the supplied or
   * standard price book; QuoteService can re-price these via PricingService
   * if it wants tier-aware unit prices.
   */
  async expandBundle(
    tenantId: string,
    bundleId: string,
    bundleQuantity: number = 1,
    customizations: BundleCustomization[] = [],
    priceBookId?: string,
  ): Promise<ExpandedBundleLine[]> {
    const bundle = await this.get(tenantId, bundleId);
    const qty = new Decimal(bundleQuantity);
    if (qty.lte(0)) throw new BadRequestException('bundleQuantity must be > 0');

    // Determine the price book once. We resolve unitPrice per product below.
    const priceBook = await this.resolvePriceBook(tenantId, priceBookId);

    const customByChild = new Map(customizations.map((c) => [c.childProductId, c]));
    const lines: ExpandedBundleLine[] = [];

    // Bundle parent row first
    const parentPrice = await this.unitPriceFor(bundle.productId, priceBook?.id);
    lines.push({
      productId: bundle.productId,
      isBundleParent: true,
      bundleId: bundle.id,
      quantity: qty,
      unitPrice: parentPrice,
      required: true,
      description: bundle.product.name,
    });

    for (const item of bundle.items) {
      const cx = customByChild.get(item.childProductId);
      const include = cx?.include ?? true;

      if (!include) {
        if (item.required) {
          throw new BadRequestException(
            `Required bundle item ${item.childProductId} cannot be excluded`,
          );
        }
        if (bundle.type === 'all_or_nothing') {
          throw new BadRequestException(
            `Bundle ${bundle.id} is all_or_nothing — child ${item.childProductId} cannot be excluded`,
          );
        }
        continue;
      }

      // Per-bundle quantity, then * bundleQuantity
      let perBundle = cx?.quantity !== undefined ? new Decimal(cx.quantity) : item.defaultQuantity;
      // Clamp to [min, max]
      if (perBundle.lt(item.minQuantity)) perBundle = item.minQuantity;
      if (item.maxQuantity && perBundle.gt(item.maxQuantity)) perBundle = item.maxQuantity;

      const total = perBundle.mul(qty);
      const childPrice = await this.unitPriceFor(item.childProductId, priceBook?.id);
      lines.push({
        productId: item.childProductId,
        isBundleParent: false,
        bundleId: bundle.id,
        quantity: total,
        unitPrice: childPrice,
        required: item.required,
        description: item.childProduct.name,
      });
    }

    return lines;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async resolvePriceBook(tenantId: string, priceBookId?: string) {
    if (priceBookId) {
      return this.prisma.priceBook.findFirst({ where: { id: priceBookId, tenantId } });
    }
    return this.prisma.priceBook.findFirst({ where: { tenantId, isStandard: true } });
  }

  private async unitPriceFor(productId: string, priceBookId?: string): Promise<Decimal> {
    if (priceBookId) {
      const entry = await this.prisma.priceBookEntry.findFirst({
        where: { productId, priceBookId, isActive: true },
      });
      if (entry) return entry.unitPrice;
    }
    // Fallback: any active entry (callers can override via PricingService later)
    const any = await this.prisma.priceBookEntry.findFirst({
      where: { productId, isActive: true },
    });
    return any?.unitPrice ?? new Decimal(0);
  }
}
