import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { ApprovalRequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../workflow/audit.service';
import type { RequestUser } from '../../common/types/request-context';

export const DEFAULT_DISCOUNT_APPROVAL_THRESHOLD = 0.2; // 20%

export class ApprovalRequiredError extends ForbiddenException {
  constructor(message: string) {
    super({ code: 'APPROVAL_REQUIRED', message });
  }
}

export interface ConvertOptions {
  skipApproval?: boolean;
}

@Injectable()
export class QuoteToOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Convert an approved Quote into a new Order.
   *
   * Flow:
   *   1. Quote.status must be 'approved' (or skipApproval).
   *   2. Every line item must have product, quantity > 0, unitPrice > 0.
   *   3. Discount-threshold check: if quote-level discount % exceeds the
   *      tenant's `cpqDiscountApprovalThreshold` setting (default 20%),
   *      an APPROVED ApprovalRequest must already exist for the quote.
   *   4. Create Order + OrderLineItem rows, mirroring the quote.
   *   5. Mark quote.status = 'ordered'.
   *   6. Audit log "quote_converted_to_order".
   *
   * Throws:
   *   - NotFoundException — quote missing/deleted
   *   - BadRequestException — line item invariants
   *   - ApprovalRequiredError — discount over threshold without approval
   */
  async convert(
    tenantId: string,
    quoteId: string,
    user: RequestUser,
    opts: ConvertOptions = {},
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
      include: { lineItems: true },
    });
    if (!quote) throw new NotFoundException(`Quote ${quoteId} not found`);

    // 1. Status gate
    if (!opts.skipApproval && quote.status !== 'approved') {
      throw new BadRequestException(
        `Quote must be in 'approved' status to convert (current: ${quote.status})`,
      );
    }

    // 2. Line item integrity
    if (quote.lineItems.length === 0) {
      throw new BadRequestException('Quote has no line items to convert');
    }
    for (const li of quote.lineItems) {
      if (!li.productId) throw new BadRequestException(`Line ${li.id} missing product`);
      if (!li.quantity || li.quantity.lte(0)) {
        throw new BadRequestException(`Line ${li.id} has invalid quantity`);
      }
      if (li.unitPrice === null || li.unitPrice === undefined || li.unitPrice.lt(0)) {
        throw new BadRequestException(`Line ${li.id} has invalid unitPrice`);
      }
    }

    // 3. Discount approval gate
    if (!opts.skipApproval) {
      await this.assertDiscountApprovalIfNeeded(tenantId, quote);
    }

    if (!quote.accountId) {
      throw new BadRequestException('Quote must have an account to convert to an order');
    }

    // 4. Create order via transaction
    const orderNumber = await this.nextOrderNumber(tenantId);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          tenantId,
          orderNumber,
          quoteId: quote.id,
          accountId: quote.accountId!,
          opportunityId: quote.opportunityId ?? undefined,
          ownerId: user.id,
          effectiveDate: new Date(),
          currencyCode: quote.currencyCode,
          subtotal: quote.subtotal,
          discountAmount: quote.discountAmount,
          taxAmount: quote.taxAmount,
          shippingAmount: quote.shippingAmount,
          grandTotal: quote.grandTotal,
          status: 'draft',
          createdById: user.id,
          updatedById: user.id,
          lineItems: {
            create: quote.lineItems.map((li) => ({
              productId: li.productId,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              discount: li.discount,
              taxRate: li.taxRate,
              subtotal: li.subtotal,
              description: li.description,
              sortOrder: li.sortOrder,
            })),
          },
        },
        include: { lineItems: true },
      });

      // 5. Mark quote ordered
      await tx.quote.update({
        where: { id: quote.id },
        data: { status: 'ordered', updatedById: user.id },
      });

      return created;
    });

    // 6. Audit
    await this.audit.log({
      tenantId,
      actorId: user.id,
      action: 'quote_converted_to_order',
      recordType: 'quote',
      recordId: quote.id,
      changes: {
        orderId: { from: null, to: order.id },
        orderNumber: { from: null, to: order.orderNumber },
        status: { from: quote.status, to: 'ordered' },
      },
    });

    return order;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async assertDiscountApprovalIfNeeded(
    tenantId: string,
    quote: {
      id: string;
      subtotal: Decimal;
      discountAmount: Decimal;
      lineItems: Array<{ discount: Decimal; subtotal: Decimal }>;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = (tenant?.settings as Record<string, unknown> | undefined) ?? {};
    const threshold = Number(
      settings['cpqDiscountApprovalThreshold'] ?? DEFAULT_DISCOUNT_APPROVAL_THRESHOLD,
    );

    const effectiveDiscountPct = this.computeEffectiveDiscount(quote);
    if (effectiveDiscountPct <= threshold) return;

    const approval = await this.prisma.approvalRequest.findFirst({
      where: {
        tenantId,
        recordType: 'quote',
        recordId: quote.id,
        status: ApprovalRequestStatus.APPROVED,
      },
      orderBy: { finalizedAt: 'desc' },
    });
    if (!approval) {
      throw new ApprovalRequiredError(
        `Discount of ${(effectiveDiscountPct * 100).toFixed(2)}% exceeds threshold ${(
          threshold * 100
        ).toFixed(2)}% — an APPROVED approval request is required before conversion`,
      );
    }
  }

  /**
   * Effective discount % across the quote.
   * = (sum of per-line discount weighted by line subtotal + quote.discountAmount) / list-subtotal
   *
   * Since QuoteLineItem.subtotal is already net-of-line-discount, we
   * approximate the list-subtotal by adding the per-line discount back.
   */
  private computeEffectiveDiscount(quote: {
    subtotal: Decimal;
    discountAmount: Decimal;
    lineItems: Array<{ discount: Decimal; subtotal: Decimal }>;
  }): number {
    let listSubtotal = new Decimal(0);
    let perLineDiscount = new Decimal(0);
    for (const li of quote.lineItems) {
      const disc = li.discount ?? new Decimal(0);
      // li.subtotal is already discounted, so list = subtotal / (1 - disc/100)
      const factor = new Decimal(1).minus(disc.div(100));
      const list = factor.gt(0) ? li.subtotal.div(factor) : li.subtotal;
      listSubtotal = listSubtotal.plus(list);
      perLineDiscount = perLineDiscount.plus(list.minus(li.subtotal));
    }
    if (listSubtotal.lte(0)) return 0;
    const totalDiscount = perLineDiscount.plus(quote.discountAmount ?? new Decimal(0));
    return Number(totalDiscount.div(listSubtotal));
  }

  private async nextOrderNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `order.${year}`;
    await this.prisma.$executeRaw`
      INSERT INTO sequence_counters (id, "tenantId", key, value)
      VALUES (gen_random_uuid(), ${tenantId}, ${key}, 1)
      ON CONFLICT ("tenantId", key) DO UPDATE SET value = sequence_counters.value + 1
    `;
    const counter = await this.prisma.sequenceCounter.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    const seq = String(counter!.value).padStart(5, '0');
    return `O-${year}-${seq}`;
  }
}
