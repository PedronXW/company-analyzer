import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SignalModule } from './signal/signal.module';
import { SnapshotModule } from './snapshot/snapshot.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [SignalModule, SnapshotModule, UploadModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
