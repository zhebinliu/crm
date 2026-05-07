import { Module } from '@nestjs/common';
import { MetadataService } from './metadata.service';
import { MetadataController } from './metadata.controller';
import { MetadataResolver } from './metadata.resolver';
import { FormulaModule } from '../formula/formula.module';

@Module({
  imports: [FormulaModule],
  providers: [MetadataService, MetadataResolver],
  controllers: [MetadataController],
  exports: [MetadataService],
})
export class MetadataModule {}
