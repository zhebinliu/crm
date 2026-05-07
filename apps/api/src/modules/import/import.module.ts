import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { LeadModule } from '../lead/lead.module';
import { AccountModule } from '../account/account.module';
import { ContactModule } from '../contact/contact.module';
import { OpportunityModule } from '../opportunity/opportunity.module';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [LeadModule, AccountModule, ContactModule, OpportunityModule, WorkflowModule],
  providers: [ImportService],
  controllers: [ImportController],
})
export class ImportModule {}
