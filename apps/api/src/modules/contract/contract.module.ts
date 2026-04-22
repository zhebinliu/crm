import { ContractResolver } from './contract.resolver';
import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';

@Module({
  imports: [WorkflowModule],
  providers: [ContractService, ContractResolver],
  controllers: [ContractController],
  exports: [ContractService],
})
export class ContractModule {}
