import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { OutboxModule } from '../../common/outbox.module';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { AccountResolver } from './account.resolver';

@Module({
  imports: [WorkflowModule, OutboxModule],
  providers: [AccountService, AccountResolver],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
