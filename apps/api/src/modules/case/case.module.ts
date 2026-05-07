import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { CaseService } from './case.service';
import { CaseController } from './case.controller';

@Module({
  imports: [WorkflowModule],
  providers: [CaseService],
  controllers: [CaseController],
  exports: [CaseService],
})
export class CaseModule {}
