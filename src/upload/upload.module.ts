import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

// Application Layer
import { FileUploadService } from '@/jobs/file-upload.service';
import { UploadService } from './upload.service';

// Infrastructure Layer - Repositories
import { PrismaModule } from '@/prisma/prisma.module';
import { UploadController } from './upload.controller';

// Infrastructure Layer - Workers
import { FileUploadProcessor } from '@/jobs/file-upload.processor';

/**
 * Módulo de upload de arquivos.
 *
 * Responsabilidades:
 * - Upload para S3
 * - Adicionar jobs à fila de processamento assíncrono
 */
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'company/upload',
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService, FileUploadService, FileUploadProcessor],
  exports: [UploadService, FileUploadService],
})
export class UploadModule { }
