// ─── SlaModule (Wave 19h) ───────────────────────────────────────────────
// SLA Policy + Entitlement + Milestone engine.
//
// Marked @Global so CaseModule can inject SlaService for fire-and-forget
// applyToCase / markFirstResponse / markResolved hooks without a circular
// import. Cron is registered via @Cron decorator on SlaService directly
// (ScheduleModule.forRoot() is wired in AppModule).

import { Global, Module } from '@nestjs/common';
import { SlaService } from './sla.service';
import { EntitlementService } from './entitlement.service';
import {
  SlaPolicyController, EntitlementController, CaseSlaController,
} from './sla.controller';

@Global()
@Module({
  providers: [SlaService, EntitlementService],
  controllers: [SlaPolicyController, EntitlementController, CaseSlaController],
  exports: [SlaService, EntitlementService],
})
export class SlaModule {}
