import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { OutboxModule } from '../../common/outbox.module';
import { PersonModule } from '../person/person.module';
import { RecycleBinModule } from '../recycle-bin/recycle-bin.module';
import { LeadService } from './lead.service';
import { LeadController } from './lead.controller';
import { LeadResolver } from './lead.resolver';

@Module({
  imports: [WorkflowModule, OutboxModule, PersonModule, RecycleBinModule],
  providers: [LeadService, LeadResolver],
  controllers: [LeadController],
  exports: [LeadService],
})
export class LeadModule {}
