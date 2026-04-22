import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { OutboxModule } from '../../common/outbox.module';
import { LeadService } from './lead.service';
import { LeadController } from './lead.controller';
import { LeadResolver } from './lead.resolver';

@Module({
  imports: [WorkflowModule, OutboxModule],
  providers: [LeadService, LeadResolver],
  controllers: [LeadController],
  exports: [LeadService],
})
export class LeadModule {}
