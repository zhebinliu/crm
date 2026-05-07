// ─── EmbeddingsModule — RAG foundation (Wave 17) ──────────────────────────
//
// Marked @Global so any service can inject EmbeddingService without
// re-importing the module. PrismaModule is already global elsewhere in
// the app.

import { Global, Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { EmbeddingController } from './embedding.controller';

@Global()
@Module({
  providers: [EmbeddingService],
  controllers: [EmbeddingController],
  exports: [EmbeddingService],
})
export class EmbeddingsModule {}
