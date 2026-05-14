import { DataAnalysisResponse, DataAnalysisService } from '../bedrock/data-analysis/data-analysis.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

/**
 * Processador de jobs de análise de dados brutos de extração.
 *
 * Stage 2 da nova arquitetura:
 * 1. Busca Section (com dados em JSON)
 * 2. Filtra apenas seções do tipo NORMAL
 * 3. Envia para LLM para análise e processamento
 * 4. Salva resultado em Analysis (schema atual)
 * 5. Atualiza status da Section
 */
@Processor('data/analyze', {
  concurrency: 1,
  autorun: true,
})
export class DataAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(DataAnalysisProcessor.name);

  constructor(
    private readonly dataAnalysisService: DataAnalysisService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<{ fileId: string; period?: string }>): Promise<void> {
    const { fileId, period } = job.data;

    this.logger.log(`Starting analysis for file ${fileId}`);

    // Buscar o File para pegar o companyId
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { company: true },
    });

    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    // Buscar apenas Sections do tipo NORMAL para análise
    const sections = await this.prisma.section.findMany({
      where: {
        fileId,
        type: 'NORMAL', // Apenas seções que devem ser processadas (type é string no Prisma)
      },
      orderBy: { orderIndex: 'asc' },
    });

    if (sections.length === 0) {
      this.logger.log(`No NORMAL sections found for file ${fileId}`);
      return;
    }

    this.logger.log(`Found ${sections.length} NORMAL sections for analysis (ignored IGNORE sections)`);

    try {
      // Agrupar dados por seção para análise
      const sectionsData = sections.map((section) => ({
        sectionTitle: section.title,
        data: (section.data as any)?.extractedItems || [],
      }));

      this.logger.log(
        `Calling Bedrock for analysis of ${sections.length} sections`,
      );

      const analysisData: DataAnalysisResponse =
        await this.dataAnalysisService.analyzeExtraction(fileId, {
          sections: sectionsData,
          period,
        });

      this.logger.log(
        `Analysis completed:`,
        {
          revenue: analysisData.revenue,
          netProfit: analysisData.netProfit,
          aiSensation: analysisData.aiSensation,
        },
      );

      // Salvar no Analysis (schema atual para análise de investimento)
      await this.prisma.analysis.create({
        data: {
          fileId: fileId,
          companyId: file.companyId,
          revenue: analysisData.revenue,
          ebitda: analysisData.ebitda,
          ebitdaMargin: analysisData.ebitdaMargin,
          netProfit: analysisData.netProfit,
          netMargin: analysisData.netMargin,
          netDebt: analysisData.netDebt,
          leverage: analysisData.leverage,
          fco: analysisData.fco,
          capex: analysisData.capex,
          dividends: analysisData.dividends,
          aiSensation: analysisData.aiSensation,
          aiSummary: analysisData.aiSummary,
          period: analysisData.period ?? period ?? '',
        },
      });

      this.logger.log(`Saved Analysis for file ${fileId}`);

      // Atualizar status das Sections para analyzed
      for (const section of sections) {
        await this.prisma.section.update({
          where: { id: section.id },
          data: {
            status: 'analyzed',
          },
        });
      }

      this.logger.log(
        `Completed analysis pipeline for file ${fileId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to analyze file ${fileId}: ${error}`);

      // Atualizar status para failed
      for (const section of sections) {
        await this.prisma.section.update({
          where: { id: section.id },
          data: {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }

      throw error;
    }
  }
}
