import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { OutboxModule } from '../../common/outbox.module';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { ContactResolver } from './contact.resolver';

@Module({
  imports: [WorkflowModule, OutboxModule],
  providers: [ContactService, ContactResolver],
  controllers: [ContactController],
  exports: [ContactService],
})
export class ContactModule {}
