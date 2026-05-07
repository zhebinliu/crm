import { ContractResolver } from './contract.resolver';
import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { RecycleBinModule } from '../recycle-bin/recycle-bin.module';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';

@Module({
  imports: [WorkflowModule, RecycleBinModule],
  providers: [ContractService, ContractResolver],
  controllers: [ContractController],
  exports: [ContractService],
})
export class ContractModule {}
