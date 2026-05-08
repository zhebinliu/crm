import { Module } from '@nestjs/common';
import { CompositeController } from './composite.controller';
import { CompositeDispatcher } from './composite.dispatcher';
import { LeadModule } from '../lead/lead.module';
import { AccountModule } from '../account/account.module';
import { ContactModule } from '../contact/contact.module';
import { OpportunityModule } from '../opportunity/opportunity.module';

// Composite API (Wave 18f). Imports the LTC modules so it can inject
// their services directly via the dispatcher. PrismaModule is @Global.
//
// WIRING (in apps/api/src/app.module.ts):
//   import { CompositeModule } from './modules/composite/composite.module';
//   ...
//   imports: [..., CompositeModule, ...],
@Module({
  imports: [LeadModule, AccountModule, ContactModule, OpportunityModule],
  providers: [CompositeDispatcher],
  controllers: [CompositeController],
})
export class CompositeModule {}
