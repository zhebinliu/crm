import { ProductResolver } from './product.resolver';
import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';

@Module({
  imports: [WorkflowModule],
  providers: [ProductService, ProductResolver],
  controllers: [ProductController],
  exports: [ProductService],
})
export class ProductModule {}
