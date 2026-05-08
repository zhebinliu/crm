import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { BundleService } from './bundle.service';
import { PricingService } from './pricing.service';
import { QuoteToOrderService } from './quote-to-order.service';
import {
  ProductBundleAdminController,
  QuoteAddBundleController,
} from './bundle.controller';
import { PricingController, QuoteRepriceController } from './pricing.controller';
import { QuoteToOrderController } from './quote-to-order.controller';

/**
 * CPQ (Configure-Price-Quote) — Wave 19e
 *
 * Adds:
 *   - ProductBundle / BundleItem CRUD + expansion
 *   - PriceTier-based dynamic pricing + quote re-pricing
 *   - Quote → Order conversion with discount-threshold approval gate
 *
 * NOTE: This module is intentionally NOT registered in AppModule yet
 * (per task constraints). When wiring it in, add:
 *   import { CpqModule } from './modules/cpq/cpq.module';
 *   imports: [..., CpqModule],
 */
@Module({
  imports: [WorkflowModule],
  providers: [BundleService, PricingService, QuoteToOrderService],
  controllers: [
    ProductBundleAdminController,
    QuoteAddBundleController,
    PricingController,
    QuoteRepriceController,
    QuoteToOrderController,
  ],
  exports: [BundleService, PricingService, QuoteToOrderService],
})
export class CpqModule {}
