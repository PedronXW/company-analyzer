import { PrismaService } from '@/prisma/prisma.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { FileUploadJobData } from '../jobs/jobs.interface';

/**
 * Processador de jobs de upload de arquivo.
 *
 * Responsabilidades:
 * - Processar jobs adicionados à fila 'company/upload'
 * - Atualizar status do arquivo para 'processed' no banco de dados
 */
@Processor('company/upload', {
  concurrency: 1,
  autorun: true,
})
export class FileUploadProcessor extends WorkerHost {
  private readonly logger = new Logger(FileUploadProcessor.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<FileUploadJobData>): Promise<void> {
    const { fileId, filename, queuedAt } = job.data;

    this.logger.log(
      `Processing file upload job for file ${fileId} (${filename})`,
    );

    // Simulação de processamento (substituir pela lógica real)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Atualizar status do arquivo para 'processed'
    await this.prisma.file.update({
      where: { id: fileId },
      data: {
        status: 'processed',
        processedAt: new Date(),
      },
    });

    this.logger.log(
      `File ${fileId} (${filename}) processed successfully`,
    );
  }
}
