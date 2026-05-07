import { Module } from '@nestjs/common';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ContractModule } from '../contract/contract.module';
import { FormulaModule } from '../formula/formula.module';

@Module({
  imports: [PrismaModule, WorkflowModule, ContractModule, FormulaModule],
  controllers: [RecordController],
  providers: [RecordService],
  exports: [RecordService],
})
export class RecordModule {}
