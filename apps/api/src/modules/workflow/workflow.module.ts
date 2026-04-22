import { ValidationRuleResolver } from './validation-rule.resolver';
import { WorkflowRuleResolver } from './workflow-rule.resolver';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { ValidationRuleService } from './validation-rule.service';
import { ValidationRuleController } from './validation-rule.controller';
import { WorkflowProcessor } from './workflow.processor';
import { WorkflowCronService } from './workflow-cron.service';
import { RecordMutatorService } from './record-mutator.service';
import { ActionsModule } from './actions/actions.module';
import { AuditService } from './audit.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'workflow' }),
    ActionsModule,
  ],
  providers: [
    WorkflowService,
    ValidationRuleService,
    WorkflowProcessor,
    WorkflowCronService,
    AuditService,
    RecordMutatorService,
    WorkflowRuleResolver,
    ValidationRuleResolver,
  ],
  controllers: [WorkflowController, ValidationRuleController],
  exports: [WorkflowService, ValidationRuleService, AuditService, RecordMutatorService],
})
export class WorkflowModule {}
