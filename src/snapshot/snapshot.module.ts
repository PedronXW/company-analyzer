import { Module } from '@nestjs/common';
import { DailySnapshotJob } from './daily-snapshot-job.service';

@Module({
  providers: [DailySnapshotJob],
})
export class SnapshotModule {}
