import { Global, Module } from '@nestjs/common';
import { FlsService } from './fls.service';

// Global so any module can inject FlsService without re-importing FlsModule.
// PrismaModule is already @Global so no extra imports needed here.
@Global()
@Module({
  providers: [FlsService],
  exports: [FlsService],
})
export class FlsModule {}
