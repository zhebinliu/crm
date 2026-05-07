import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RecycleBinService } from './recycle-bin.service';

/**
 * Daily purge of expired recycle bin entries (runs at 03:00 server time).
 *
 * `@nestjs/schedule` is already wired in AppModule via ScheduleModule.forRoot().
 */
@Injectable()
export class RecycleBinPurgeService {
  private readonly log = new Logger(RecycleBinPurgeService.name);

  constructor(private readonly recycleBin: RecycleBinService) {}

  @Cron('0 3 * * *')
  async dailyPurge(): Promise<void> {
    try {
      const purged = await this.recycleBin.purgeExpired();
      this.log.log(`Daily purge complete: ${purged} entries removed`);
    } catch (e) {
      this.log.error(`Daily purge failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}
