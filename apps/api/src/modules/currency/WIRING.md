# Wave 19g — Localization (currency + i18n): Wiring TODO

This wave is constrained to NOT modify `apps/api/src/app.module.ts`. The
orchestrator must register the new modules + middleware before this code
runs end-to-end.

## Required changes in `apps/api/src/app.module.ts`

```ts
import { CurrencyModule }     from './modules/currency/currency.module';
import { TranslationModule }  from './modules/i18n/translation.module';
import { LocaleMiddleware }   from './common/locale.middleware';

@Module({
  imports: [
    // ...existing modules...
    CurrencyModule,      // ← @Global() — provides CurrencyService
    TranslationModule,   // ← @Global() — provides TranslationService
    // ...
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // ...existing middlewares...
    consumer.apply(LocaleMiddleware).forRoutes('*');
  }
}
```

Both modules are `@Global()`, so any service can constructor-inject the
service once the module is registered. Order does not matter.

## What is already wired (DO NOT redo)

- `OpportunityService`, `QuoteService`, `OrderService` constructor-inject
  `CurrencyService` (`@Optional()`). Each calls
  `currency.applyAfterSave(entity, tenantId, recordId)` after every create
  / update / line-item rollup. Failures log and swallow.
- `MetadataService` constructor-injects `TranslationService` (`@Optional()`)
  and applies translations in `getObject(tid, apiName, locale)` when the
  caller passes a locale.
- `MetadataController` (admin) honors `?lang=` on `getObject`.
- `PublicMetadataController` exposes `GET /api/metadata/objects/:apiName?lang=`.
- `LocaleMiddleware` reads `?lang=` then `Accept-Language` then default
  `zh-CN` and stores on `req.locale`.

## Schema (already pushed)

- `currency_rates` — per-tenant FX rates with effective windows + provenance.
- `label_translations` — polymorphic (object/field/picklist/picklist_value),
  per-locale label / description / helpText overrides.
- `Opportunity.convertedAmount`, `Quote.convertedAmount`,
  `Order.convertedAmount` — `Decimal(18,2)?`. Auto-filled when a rate
  to the tenant's `corporateCurrency` exists.

## Endpoints

- `GET/POST/PATCH/DELETE /api/admin/currency-rates` — admin.* required.
- `GET /api/admin/currency-rates/effective?from=&to=&asOf=` — resolves the
  effective rate (with inverse-pair fallback).
- `POST /api/admin/currency-rates/recompute` — bulk recompute
  `convertedAmount` across all opps/quotes/orders.
- `GET/PUT/DELETE /api/admin/translations/...` — manage label overrides.
- `GET /api/metadata/objects/:apiName?lang=en-US` — public (metadata.read).
