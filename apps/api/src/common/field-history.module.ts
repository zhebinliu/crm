// ─── FieldHistoryModule (Wave 18b) ──────────────────────────────────────
//
// Provides FieldHistoryService globally so BaseEntityService can record
// field-level changes alongside the existing audit log, plus the admin
// REST viewer at /api/admin/records/:type/:id/field-history.
//
// IMPORTANT: this module is NOT yet wired in app.module.ts. Add to imports:
//   import { FieldHistoryModule } from './common/field-history.module';
//   ... imports: [..., FieldHistoryModule],
//
// Once wired, BaseEntityService.afterUpdate will start writing rows to
// `field_history` automatically.

import { Global, Module } from '@nestjs/common';
import { FieldHistoryService } from './field-history.service';
import { FieldHistoryController } from './field-history.controller';

@Global()
@Module({
  providers: [FieldHistoryService],
  controllers: [FieldHistoryController],
  exports: [FieldHistoryService],
})
export class FieldHistoryModule {}
