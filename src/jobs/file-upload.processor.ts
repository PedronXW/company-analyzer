import { DATA_EXTRACTION } from '@/prisma/prisma.constants';
import { PrismaService } from '@/prisma/prisma.service';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

/**
 * Processador de jobs de upload de arquivo.
 *
 * Responsabilidades:
 * - Processar jobs adicionados à fila 'company/upload'
 * - Atualizar status do arquivo para 'processed' no banco de dados
 * - Disparar job de extração de dados financeiros após o processamento
 *
 * Arquitetura: Infrastructure Layer (FileUploadProcessor)
 * Separa a infraestrutura de processamento da lógica de negócio.
 */
@Processor('company/upload', {
  concurrency: 1,
  autorun: true,
})
export class FileUploadProcessor extends WorkerHost {
  private readonly logger = new Logger(FileUploadProcessor.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(DATA_EXTRACTION)
    private readonly dataExtractionQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ fileId: string }>): Promise<void> {
    const { fileId } = job.data;

    const file = await this.prisma.file.findUnique({
      where: {
        id: fileId
      }
    })

    if (!file) {
      throw new Error('File not found')
    }

    this.logger.log(
      `Processing file upload job for file ${fileId} (${file?.filename})`,
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
      `File ${fileId} (${file?.filename}) processed successfully`,
    );

    // Usar a fila 'data/extraction' para extração de dados financeiros
    await this.dataExtractionQueue.add(
      'data/extraction',
      {
        fileId,
      }
    );

    this.logger.log(
      `Disparado job de extração de dados financeiros para file ${fileId}`,
    );
  }
}
