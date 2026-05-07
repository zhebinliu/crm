import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { RecycleBinModule } from '../recycle-bin/recycle-bin.module';
import { CaseService } from './case.service';
import { CaseController } from './case.controller';

@Module({
  imports: [WorkflowModule, RecycleBinModule],
  providers: [CaseService],
  controllers: [CaseController],
  exports: [CaseService],
})
export class CaseModule {}
