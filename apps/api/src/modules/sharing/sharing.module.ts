import { Module } from '@nestjs/common';
import { SharingService } from './sharing.service';
import { SharingController } from './sharing.controller';
import { OrgWideDefaultsService } from './owd.service';
import { OrgWideDefaultsController } from './owd.controller';
import { PublicGroupService } from './public-group.service';
import { PublicGroupController } from './public-group.controller';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';

@Module({
  providers: [
    SharingService,
    OrgWideDefaultsService,
    PublicGroupService,
    QueueService,
  ],
  controllers: [
    SharingController,
    OrgWideDefaultsController,
    PublicGroupController,
    QueueController,
  ],
  exports: [
    SharingService,
    OrgWideDefaultsService,
    PublicGroupService,
    QueueService,
  ],
})
export class SharingModule {}
