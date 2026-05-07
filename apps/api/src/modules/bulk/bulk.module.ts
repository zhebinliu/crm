import { Module } from '@nestjs/common';
import { LeadModule } from '../lead/lead.module';
import { AccountModule } from '../account/account.module';
import { ContactModule } from '../contact/contact.module';
import { OpportunityModule } from '../opportunity/opportunity.module';
import { CaseModule } from '../case/case.module';
import { CampaignModule } from '../campaign/campaign.module';
import { BulkService } from './bulk.service';
import { BulkController } from './bulk.controller';

@Module({
  imports: [LeadModule, AccountModule, ContactModule, OpportunityModule, CaseModule, CampaignModule],
  providers: [BulkService],
  controllers: [BulkController],
})
export class BulkModule {}
