import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { RecycleBinModule } from '../recycle-bin/recycle-bin.module';
import { OpportunityService } from './opportunity.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityResolver } from './opportunity.resolver';

@Module({
  imports: [WorkflowModule, RecycleBinModule],
  providers: [OpportunityService, OpportunityResolver],
  controllers: [OpportunityController],
  exports: [OpportunityService],
})
export class OpportunityModule {}
