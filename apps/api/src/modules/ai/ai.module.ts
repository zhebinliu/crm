import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { AiChatService } from './ai-chat.service';
import { AiAnomalyService } from './ai-anomaly.service';
import { ClaudeClient } from './claude.client';
import { AiController } from './ai.controller';

@Module({
  providers: [AiService, AiContextService, AiChatService, AiAnomalyService, ClaudeClient],
  controllers: [AiController],
  exports: [AiService, AiChatService, AiAnomalyService],
})
export class AiModule {}
