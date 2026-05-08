import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { BundleService } from './bundle.service';
import { PricingService } from './pricing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { RequestUser } from '../../common/types/request-context';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class CreateBundleDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsBoolean() fixedPrice?: boolean;
}

export class UpdateBundleDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsBoolean() fixedPrice?: boolean;
}

export class CreateBundleItemDto {
  @IsString() childProductId!: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsNumber() @Min(0) defaultQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) minQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) maxQuantity?: number;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class UpdateBundleItemDto {
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsNumber() @Min(0) defaultQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) minQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) maxQuantity?: number;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class BundleCustomizationDto {
  @IsString() childProductId!: string;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsBoolean() include?: boolean;
}

export class AddBundleToQuoteDto {
  @IsString() bundleId!: string;
  @IsOptional() @IsNumber() @Min(1) quantity?: number = 1;
  @IsOptional() @IsString() priceBookId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BundleCustomizationDto)
  customizations?: BundleCustomizationDto[];
}

// ── Admin: ProductBundle CRUD ────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('admin/product-bundles')
export class ProductBundleAdminController {
  constructor(private readonly service: BundleService) {}

  @Get()
  @RequirePermissions('product.read')
  list(@TenantId() tenantId: string) {
    return this.service.list(tenantId);
  }

  @Get(':id')
  @RequirePermissions('product.read')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  @RequirePermissions('product.write')
  create(@TenantId() tenantId: string, @Body() body: CreateBundleDto) {
    return this.service.create(tenantId, body);
  }

  @Patch(':id')
  @RequirePermissions('product.write')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: UpdateBundleDto) {
    return this.service.update(tenantId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('product.write')
  delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.delete(tenantId, id);
  }

  @Post(':id/items')
  @RequirePermissions('product.write')
  addItem(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: CreateBundleItemDto,
  ) {
    return this.service.addItem(tenantId, id, body);
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions('product.write')
  updateItem(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateBundleItemDto,
  ) {
    return this.service.updateItem(tenantId, id, itemId, body);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('product.write')
  removeItem(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.removeItem(tenantId, id, itemId);
  }
}

// ── Quote: add-bundle ────────────────────────────────────────────────────────

@UseGuards(PermissionsGuard)
@Controller('quotes')
export class QuoteAddBundleController {
  constructor(
    private readonly bundles: BundleService,
    private readonly pricing: PricingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Expand a bundle into QuoteLineItem rows on the given quote.
   * Pricing is taken from PriceTier-aware {@link PricingService.priceLine}.
   */
  @Post(':quoteId/add-bundle')
  @RequirePermissions('quote.write')
  async addBundle(
    @TenantId() tenantId: string,
    @Param('quoteId') quoteId: string,
    @Body() body: AddBundleToQuoteDto,
    @CurrentUser() _user: RequestUser,
  ) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId, deletedAt: null },
    });
    if (!quote) {
      throw new NotFoundException(`Quote ${quoteId} not found`);
    }

    const expanded = await this.bundles.expandBundle(
      tenantId,
      body.bundleId,
      body.quantity ?? 1,
      body.customizations ?? [],
      body.priceBookId,
    );

    const created = [] as Array<{ id: string; productId: string }>;
    let nextSort = await this.prisma.quoteLineItem
      .count({ where: { quoteId } })
      .then((n) => n);

    for (const line of expanded) {
      // Re-price each line through PricingService (tier-aware)
      const priced = await this.pricing.priceLine(
        tenantId,
        line.productId,
        Number(line.quantity),
        body.priceBookId,
        { currencyCode: quote.currencyCode },
      );
      const subtotal = priced.unitPrice.mul(line.quantity);
      const li = await this.prisma.quoteLineItem.create({
        data: {
          quoteId,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: priced.unitPrice,
          discount: priced.discount,
          taxRate: new Decimal(0),
          subtotal,
          description: line.description,
          sortOrder: nextSort++,
        },
      });
      created.push({ id: li.id, productId: li.productId });
    }

    // Recompute totals (mirrors QuoteService.recalculateTotals)
    const items = await this.prisma.quoteLineItem.findMany({ where: { quoteId } });
    const subtotal = items.reduce((s, li) => s.plus(li.subtotal), new Decimal(0));
    const taxAmount = items.reduce(
      (s, li) => s.plus(li.subtotal.mul(li.taxRate ?? new Decimal(0)).div(100)),
      new Decimal(0),
    );
    const grandTotal = subtotal
      .minus(quote.discountAmount ?? new Decimal(0))
      .plus(taxAmount)
      .plus(quote.shippingAmount ?? new Decimal(0));
    await this.prisma.quote.update({
      where: { id: quoteId },
      data: { subtotal, taxAmount, grandTotal },
    });

    return { added: created.length, lineItems: created };
  }
}
