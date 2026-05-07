import { Module } from '@nestjs/common';
import { RecycleBinService } from './recycle-bin.service';
import { RecycleBinController } from './recycle-bin.controller';
import { RecycleBinPurgeService } from './recycle-bin-purge.service';

@Module({
  providers: [RecycleBinService, RecycleBinPurgeService],
  controllers: [RecycleBinController],
  exports: [RecycleBinService],
})
export class RecycleBinModule {}
