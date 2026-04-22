import { PriceBookResolver } from './pricebook.resolver';
import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { PriceBookService } from './pricebook.service';
import { PriceBookController } from './pricebook.controller';

@Module({
  imports: [WorkflowModule],
  providers: [PriceBookService, PriceBookResolver],
  controllers: [PriceBookController],
  exports: [PriceBookService],
})
export class PriceBookModule {}
