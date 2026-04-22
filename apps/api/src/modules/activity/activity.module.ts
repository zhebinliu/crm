import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { ActivityResolver } from './activity.resolver';

@Module({
  imports: [WorkflowModule],
  providers: [ActivityService, ActivityResolver],
  controllers: [ActivityController],
  exports: [ActivityService],
})
export class ActivityModule {}
