import { Module } from '@nestjs/common';
import { MetadataService } from './metadata.service';
import { MetadataController } from './metadata.controller';
import { MetadataResolver } from './metadata.resolver';
import { FormulaModule } from '../formula/formula.module';
import { RecordTypeService } from './record-type.service';
import { RecordTypeController } from './record-type.controller';
import { PageLayoutService } from './page-layout.service';
import { PageLayoutController } from './page-layout.controller';

@Module({
  imports: [FormulaModule],
  providers: [MetadataService, MetadataResolver, RecordTypeService, PageLayoutService],
  controllers: [MetadataController, RecordTypeController, PageLayoutController],
  exports: [MetadataService, RecordTypeService, PageLayoutService],
})
export class MetadataModule {}
