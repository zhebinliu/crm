import { QuoteResolver } from './quote.resolver';
import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { QuoteService } from './quote.service';
import { QuoteController } from './quote.controller';

@Module({
  imports: [WorkflowModule],
  providers: [QuoteService, QuoteResolver],
  controllers: [QuoteController],
  exports: [QuoteService],
})
export class QuoteModule {}
