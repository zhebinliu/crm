import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PricingService } from './pricing.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class PriceLineDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsOptional() @IsString() priceBookId?: string;
  @IsOptional() @IsString() currencyCode?: string;
}

@UseGuards(PermissionsGuard)
@Controller('cpq')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  /**
   * Price a single line — used by the quote-builder UI to preview the
   * tier-discounted unit price before committing a line item.
   */
  @Post('price-line')
  @RequirePermissions('quote.read')
  priceLine(@TenantId() tenantId: string, @Body() body: PriceLineDto) {
    return this.pricing.priceLine(tenantId, body.productId, body.quantity, body.priceBookId, {
      currencyCode: body.currencyCode,
    });
  }
}

@UseGuards(PermissionsGuard)
@Controller('quotes')
export class QuoteRepriceController {
  constructor(private readonly pricing: PricingService) {}

  /** Recompute every line's tier price + roll up totals. */
  @Post(':id/reprice')
  @RequirePermissions('quote.write')
  reprice(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.pricing.priceQuote(tenantId, id);
  }
}
