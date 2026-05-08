import { PrismaService } from '@/prisma/prisma.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

/**
 * Processador de jobs de identificação de empresa.
 *
 * Responsabilidades:
 * - Processar jobs adicionados à fila 'company/identification'
 * - Identificar empresas no documento usando Bedrock
 * - Salvar os resultados no banco de dados
 *
 * Arquitetura: Infrastructure Layer (DataExtractionProcessor)
 * Separa a infraestrutura de processamento da lógica de negócio.
 */
@Processor('data/extraction', {
  concurrency: 1,
  autorun: true,
})
export class DataExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(DataExtractionProcessor.name);

  constructor(
    private prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<{ fileId: string }>): Promise<void> {
    const { fileId } = job.data;

    this.logger.log(
      `Processing company identification job for file ${fileId}`,
    );

    const file = await this.prisma.file.findUnique({
      where: {
        id: fileId
      }
    })

    if (!file) {
      throw new Error("File not found")
    }

    try {
      this.logger.log(
        `Company identification completed for file ${fileId}: ${file.companyId}`,
      );

      // Salvar os resultados no banco de dados
      await this.prisma.analysis.create({
        data: {
          fileId,
        },
      });

      this.logger.log(
        `Saved company identification result for file ${fileId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process extraction job for file ${fileId}: ${error}`,
      );

      throw error;
    }
  }
}
