import { OrderResolver } from './order.resolver';
import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { RecycleBinModule } from '../recycle-bin/recycle-bin.module';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';

@Module({
  imports: [WorkflowModule, RecycleBinModule],
  providers: [OrderService, OrderResolver],
  controllers: [OrderController],
  exports: [OrderService],
})
export class OrderModule {}
