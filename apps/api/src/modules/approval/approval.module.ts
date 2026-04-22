import { ApprovalRequestResolver } from './approval-request.resolver';
import { ApprovalProcessResolver } from './approval-process.resolver';
import { Module } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';
import { WorkflowModule } from '../workflow/workflow.module';
import { ActionsModule } from '../workflow/actions/actions.module';

@Module({
  imports: [WorkflowModule, ActionsModule],
  providers: [ApprovalService, ApprovalProcessResolver, ApprovalRequestResolver],
  controllers: [ApprovalController],
  exports: [ApprovalService],
})
export class ApprovalModule {}
