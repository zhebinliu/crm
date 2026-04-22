import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { OpportunityService } from './opportunity.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityResolver } from './opportunity.resolver';

@Module({
  imports: [WorkflowModule],
  providers: [OpportunityService, OpportunityResolver],
  controllers: [OpportunityController],
  exports: [OpportunityService],
})
export class OpportunityModule {}
