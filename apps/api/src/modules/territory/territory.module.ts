import { Global, Module } from '@nestjs/common';
import { TerritoryService } from './territory.service';
import { AssignmentEngineService } from './assignment-engine.service';
import { TerritoryController } from './territory.controller';

// Marked @Global so AccountService / SharingService can inject TerritoryService
// + AssignmentEngineService without each module re-importing TerritoryModule.
// PrismaModule is already global in this codebase, so no extra imports here.
//
// Wiring path: this module is imported by AccountModule (allowed). Once
// imported anywhere, @Global makes its providers available app-wide.
@Global()
@Module({
  providers: [TerritoryService, AssignmentEngineService],
  controllers: [TerritoryController],
  exports: [TerritoryService, AssignmentEngineService],
})
export class TerritoryModule {}
