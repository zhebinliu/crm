import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { AiChatService } from './ai-chat.service';
import { AiAnomalyService } from './ai-anomaly.service';
import { ClaudeClient } from './claude.client';
import { AiController } from './ai.controller';
import { PiiRedactorService } from './pii-redactor.service';
import { RagRerankerService } from './rag-reranker.service';

// Marked @Global so EmbeddingsModule can optionally inject PiiRedactorService
// without importing AiModule (avoiding a circular dependency).
@Global()
@Module({
  providers: [
    AiService,
    AiContextService,
    AiChatService,
    AiAnomalyService,
    ClaudeClient,
    PiiRedactorService,
    RagRerankerService,
  ],
  controllers: [AiController],
  exports: [
    AiService,
    AiChatService,
    AiAnomalyService,
    PiiRedactorService,
    RagRerankerService,
  ],
})
export class AiModule {}
