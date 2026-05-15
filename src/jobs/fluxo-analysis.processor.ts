import { FluxoAnalysisResult, FluxoAnalysisService } from '@/bedrock/fluxo-analysis/fluxo-analysis.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

/**
 * Processador de jobs de análise de fluxo entre lançamentos de resultados.
 *
 * Estratégia:
 * 1. Processa jobs adicionados à fila 'fluxo/analyze'
 * 2. Busca o lançamento anterior da mesma empresa
 * 3. Compara métricas financeiras entre lançamentos
 * 4. Salva o resultado em FluxoAnalysis
 * 5. Atualiza status das Sections relacionadas
 */
@Processor('fluxo/analyze', {
  concurrency: 1,
  autorun: true,
})
export class FluxoAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(FluxoAnalysisProcessor.name);

  constructor(
    private readonly fluxoAnalysisService: FluxoAnalysisService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<{ fileId: string }>): Promise<void> {
    const { fileId } = job.data;

    this.logger.log(`Starting fluxo analysis for file ${fileId}`);

    // Buscar o File para pegar o companyId e period
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { company: true },
    });

    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    try {
      // Executar análise de fluxo
      const fluxoResult: FluxoAnalysisResult =
        await this.fluxoAnalysisService.analyzeFluxo(fileId);

      this.logger.log(`Fluxo analysis completed:`, {
        periodComparison: fluxoResult.periodComparison,
        qualityScore: fluxoResult.qualityScore,
        anomalyDetected: fluxoResult.anomalyDetected,
        fluxoSensation: fluxoResult.fluxoSensation,
        metrics: {
          revenue: fluxoResult.revenue ? 'comparado' : 'n/a',
          ebitda: fluxoResult.ebitda ? 'comparado' : 'n/a',
          netProfit: fluxoResult.netProfit ? 'comparado' : 'n/a',
        },
      });

      // Salvar no FluxoAnalysis
      await this.prisma.fluxoAnalysis.create({
        data: {
          currentFileId: fileId,
          previousFileId: fluxoResult.previousAnalysisId,
          periodComparison: fluxoResult.periodComparison,
          comparisonType: fluxoResult.comparisonType,
          // Métricas de receita
          revenueChange: fluxoResult.revenue?.change,
          revenueChangePct: fluxoResult.revenue?.changePct,
          revenueTrend: fluxoResult.revenue?.trend?.toUpperCase() as any,
          // Métricas de EBITDA
          ebitdaChange: fluxoResult.ebitda?.change,
          ebitdaChangePct: fluxoResult.ebitda?.changePct,
          ebitdaTrend: fluxoResult.ebitda?.trend?.toUpperCase() as any,
          // Métricas de Lucro Líquido
          netProfitChange: fluxoResult.netProfit?.change,
          netProfitChangePct: fluxoResult.netProfit?.changePct,
          netProfitTrend: fluxoResult.netProfit?.trend?.toUpperCase() as any,
          // Métricas de FCO
          fcoChange: fluxoResult.fco?.change,
          fcoChangePct: fluxoResult.fco?.changePct,
          fcoTrend: fluxoResult.fco?.trend?.toUpperCase() as any,
          // Métricas de Dividendos
          dividendsChange: fluxoResult.dividends?.change,
          dividendsChangePct: fluxoResult.dividends?.changePct,
          dividendsTrend: fluxoResult.dividends?.trend?.toUpperCase() as any,
          // Qualidade e anomalias
          qualityScore: fluxoResult.qualityScore,
          anomalyDetected: fluxoResult.anomalyDetected,
          anomalyReason: fluxoResult.anomalyReason,
          // Resumo
          fluxoSummary: fluxoResult.fluxoSummary,
          fluxoSensation: fluxoResult.fluxoSensation,
        },
      });

      this.logger.log(`Saved FluxoAnalysis for file ${fileId}`);

      // Atualizar status das Sections para 'fluxo-analyzed'
      await this.prisma.section.updateMany({
        where: { fileId },
        data: { status: 'fluxo-analyzed' },
      });

      this.logger.log(`Completed fluxo analysis pipeline for file ${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to analyze fluxo for file ${fileId}: ${error}`);

      // Atualizar status das Sections para 'fluxo-failed'
      await this.prisma.section.updateMany({
        where: { fileId },
        data: {
          status: 'fluxo-failed',
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }
}
