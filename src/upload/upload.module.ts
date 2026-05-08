import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

// Application Layer
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
 * - Disparar job de identificação de empresa após o processamento
 */
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'company/upload',
    }),
    BullModule.registerQueue({
      name: 'data/extraction',
    }),
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    FileUploadProcessor,
  ],
  exports: [UploadService],
})
export class UploadModule { }
