import { FileUploadJobData } from '@/jobs/jobs.interface';
import { FILE_UPLOAD_QUEUE } from '@/prisma/prisma.constants';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { File } from '@prisma/client';
import type { Queue } from 'bullmq';

/**
 * Serviço de aplicação para gerenciamento de upload de arquivos.
 *
 * Responsabilidades:
 * - Adicionar jobs à fila de upload automaticamente quando arquivo é criado
 * - Gerenciar lógica de negócio para arquivos
 *
 * Arquitetura: Application Layer (FileUploadService)
 * Separa a lógica de adicionar jobs da infraestrutura de processamento.
 */
@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);

  constructor(
    @InjectQueue(FILE_UPLOAD_QUEUE)
    private readonly uploadQueue: Queue<FileUploadJobData>,
  ) { }

  /**
   * Adiciona job de processamento à fila BullMQ.
   *
   * É acionado quando um novo arquivo é adicionado no banco de dados.
   *
   * @param fileId ID do arquivo
   * @param filename Nome do arquivo
   * @param priority Prioridade (menor = mais prioritário)
   */
  async queueProcessing(
    fileId: File['id'],
    filename: File['filename'],
    priority = 10,
  ): Promise<void> {
    try {
      const jobData: FileUploadJobData = {
        fileId,
        filename,
        queuedAt: new Date(),
      };

      await this.uploadQueue.add('company/upload', jobData, {
        priority,
        jobId: `process-${fileId}`, // ID único para evitar duplicatas
        removeOnComplete: true,
        removeOnFail: false,
      });

      this.logger.debug(
        `Queued processing job for file ${fileId} (priority: ${priority})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue processing job for file ${fileId}: ${error}`,
      );
      // Não falhar a criação do arquivo se o job falhar
    }
  }
}
