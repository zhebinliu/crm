import { Module } from '@nestjs/common';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ContractModule } from '../contract/contract.module';

@Module({
  imports: [PrismaModule, WorkflowModule, ContractModule],
  controllers: [RecordController],
  providers: [RecordService],
  exports: [RecordService],
})
export class RecordModule {}
