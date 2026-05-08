import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { RecycleBinModule } from '../recycle-bin/recycle-bin.module';
import { MetadataModule } from '../metadata/metadata.module';
// CurrencyModule is @Global() — CurrencyService is auto-injectable (Wave 19g).
import { OpportunityService } from './opportunity.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityResolver } from './opportunity.resolver';

@Module({
  imports: [WorkflowModule, RecycleBinModule, MetadataModule],
  providers: [OpportunityService, OpportunityResolver],
  controllers: [OpportunityController],
  exports: [OpportunityService],
})
export class OpportunityModule {}
