import { OrderResolver } from './order.resolver';
import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';

@Module({
  imports: [WorkflowModule],
  providers: [OrderService, OrderResolver],
  controllers: [OrderController],
  exports: [OrderService],
})
export class OrderModule {}
