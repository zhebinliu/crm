import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';

// SOQL-style read endpoint (Wave 18f).
// PrismaModule + FlsModule are @Global so we don't import them explicitly.
//
// WIRING (in apps/api/src/app.module.ts):
//   import { QueryModule } from './modules/query/query.module';
//   ...
//   imports: [..., QueryModule, ...],
@Module({
  controllers: [QueryController],
})
export class QueryModule {}
