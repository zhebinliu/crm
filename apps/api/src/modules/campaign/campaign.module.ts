import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';

@Module({
  imports: [WorkflowModule],
  providers: [CampaignService],
  controllers: [CampaignController],
  exports: [CampaignService],
})
export class CampaignModule {}
