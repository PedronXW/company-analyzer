import { PeriodExtractionResult, PeriodExtractionService } from '@/bedrock/period-extraction/period-extraction.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { DATA_EXTRACTION, PERIOD_EXTRACTION } from '@/prisma/prisma.constants';

/**
 * Processador de jobs de extração de período de documentos.
 *
 * Estratégia:
 * 1. Usa Bedrock para analisar o PDF e identificar o período (trimestre/ano)
 * 2. Dispara job de extração de dados com o período encontrado
 *
 * Este job é o primeiro da pipeline de processamento,
 * garantindo que todos os jobs subsequentes tenham contexto de período.
 */
@Processor(PERIOD_EXTRACTION, {
  concurrency: 1,
  autorun: true,
})
export class PeriodExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(PeriodExtractionProcessor.name);

  constructor(
    private prisma: PrismaService,
    private readonly periodExtractionService: PeriodExtractionService,
    @InjectQueue(DATA_EXTRACTION) private readonly dataExtractionQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ fileId: string }>): Promise<void> {
    const { fileId } = job.data;

    this.logger.log(`Processing period extraction job for file ${fileId}`);

    const file = await this.prisma.file.findUnique({
      where: {
        id: fileId,
      },
    });

    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const s3Uri = `s3://panap-ravel-files/${fileId}`;

    try {
      this.logger.log(`Calling Bedrock for period extraction on file ${fileId}`);

      // Chama o serviço de extração de período
      const periodResult: PeriodExtractionResult =
        await this.periodExtractionService.extractPeriod(s3Uri);

      this.logger.log(`Period extraction completed for file ${fileId}: ${periodResult.period}`);

      // Salvar o período e confiança no arquivo
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          period: periodResult.period,
          periodConfidence: periodResult.confidence,
        },
      });
      this.logger.log(`Saved period ${periodResult.period} for file ${fileId}`);

      // Disparar job de extração de dados com o período encontrado
      this.logger.log(`Disparando job de extração de dados para file ${fileId}`);
      await this.dataExtractionQueue.add('data/extraction', {
        fileId,
        period: periodResult.period,
      });

      this.logger.log(`Job de extração de dados disparado para file ${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to extract period for file ${fileId}: ${error}`);

      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          status: 'failed',
          processedAt: new Date(),
        },
      });

      throw error;
    }
  }
}
