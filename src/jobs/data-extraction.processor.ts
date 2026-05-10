import { DataExtractionResponse, DataExtractionService } from '@/bedrock/data-extraction/data-extraction.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

/**
 * Processador de jobs de extração de dados financeiros de empresa.
 *
 * Responsabilidades:
 * - Processar jobs adicionados à fila 'data/extraction'
 * - Extrair dados financeiros da empresa usando Amazon Bedrock
 * - Salvar os resultados no banco de dados
 *
 * Arquitetura: Infrastructure Layer (DataExtractionProcessor)
 * Separa a infraestrutura de processamento da lógica de negócio.
 *
 * ONTOLOGIA DINÂMICA DE EVENTOS:
 * - Application Layer: UploadController, UploadService (geração de jobs)
 * - Infrastructure Layer: DataExtractionProcessor (processamento assíncrono)
 */
@Processor('data/extraction', {
  concurrency: 1,
  autorun: true,
})
export class DataExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(DataExtractionProcessor.name);

  constructor(
    private prisma: PrismaService,
    private dataExtractionService: DataExtractionService,
  ) {
    super();
  }

  async process(job: Job<{ fileId: string; period?: string; }>): Promise<void> {
    const { fileId, period } = job.data;

    this.logger.log(
      `Processing data extraction job for file ${fileId}`,
    );

    const file = await this.prisma.file.findUnique({
      where: {
        id: fileId,
      },
    });

    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    try {
      // Constrói o URI S3 completo para o arquivo
      const s3Uri = `s3://panap-ravel-files/${fileId}`;

      this.logger.log(
        `Calling Bedrock for financial data extraction on file ${fileId}`,
      );

      // Chama o serviço de Bedrock para extrair dados financeiros
      const extractionData: DataExtractionResponse =
        await this.dataExtractionService.extractFinancialData(s3Uri);

      this.logger.log(
        `Financial data extraction completed for file ${fileId}:`,
        {
          revenue: extractionData.revenue,
          netProfit: extractionData.netProfit,
          aiSensation: extractionData.aiSensation,
        },
      );

      // Salva os dados financeiros no banco de dados
      await this.prisma.analysis.create({
        data: {
          fileId,
          companyId: file.companyId,
          revenue: extractionData.revenue,
          ebitda: extractionData.ebitda,
          ebitdaMargin: extractionData.ebitdaMargin,
          netProfit: extractionData.netProfit,
          netMargin: extractionData.netMargin,
          netDebt: extractionData.netDebt,
          leverage: extractionData.leverage,
          fco: extractionData.fco,
          capex: extractionData.capex,
          dividends: extractionData.dividends,
          aiSensation: extractionData.aiSensation,
          aiSummary: extractionData.aiSummary,
          period: period ?? ''
        },
      });

      this.logger.log(
        `Saved financial data extraction result for file ${fileId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process extraction job for file ${fileId}: ${error}`,
      );

      throw error;
    }
  }
}
