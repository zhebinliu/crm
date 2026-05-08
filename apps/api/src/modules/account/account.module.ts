import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { OutboxModule } from '../../common/outbox.module';
import { RecycleBinModule } from '../recycle-bin/recycle-bin.module';
import { TerritoryModule } from '../territory/territory.module';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { AccountResolver } from './account.resolver';

@Module({
  // TerritoryModule is @Global; importing it here is what brings it into the
  // app graph (we are not allowed to touch app.module.ts). Once the module is
  // bootstrapped its providers are available everywhere — including inside
  // SharingService.
  imports: [WorkflowModule, OutboxModule, RecycleBinModule, TerritoryModule],
  providers: [AccountService, AccountResolver],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
