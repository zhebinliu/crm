// ─── KnowledgeModule (Wave 19h) ──────────────────────────────────────────
// Knowledge Base for case deflection. Hooks into the existing embedding
// + RAG-reranker pipeline (both already @Global so no extra imports).
// Marked @Global so CaseModule (and tests) can inject KnowledgeService
// without a circular import.

import { Global, Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController, CaseDeflectionController } from './knowledge.controller';

@Global()
@Module({
  imports: [WorkflowModule],
  providers: [KnowledgeService],
  controllers: [KnowledgeController, CaseDeflectionController],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
