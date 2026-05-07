import { Module } from '@nestjs/common';
import { ListViewService } from './list-view.service';
import { ListViewController } from './list-view.controller';

@Module({
  providers: [ListViewService],
  controllers: [ListViewController],
  exports: [ListViewService],
})
export class ListViewModule {}
