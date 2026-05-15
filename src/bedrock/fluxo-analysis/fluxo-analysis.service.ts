import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RawExtractionData, DataExtractionService } from '../data-extraction/data-extraction.service';
import { z } from 'zod';

/**
 * Interface para a resposta de análise de fluxo entre lançamentos.
 */
export interface FluxoAnalysisResult {
  currentAnalysisId: string;
  previousAnalysisId?: string;
  periodComparison: string;
  comparisonType: 'YOY' | 'QOQ' | 'sequential';

  // Métricas comparativas
  revenue?: {
    current: number;
    previous?: number;
    change?: number;
    changePct?: number;
    trend?: 'accelerating' | 'improving' | 'stable' | 'declining' | 'deteriorating';
  };

  ebitda?: {
    current: number;
    previous?: number;
    change?: number;
    changePct?: number;
    trend?: 'accelerating' | 'improving' | 'stable' | 'declining' | 'deteriorating';
  };

  netProfit?: {
    current: number;
    previous?: number;
    change?: number;
    changePct?: number;
    trend?: 'accelerating' | 'improving' | 'stable' | 'declining' | 'deteriorating';
  };

  fco?: {
    current: number;
    previous?: number;
    change?: number;
    changePct?: number;
    trend?: 'accelerating' | 'improving' | 'stable' | 'declining' | 'deteriorating';
  };

  dividends?: {
    current: number;
    previous?: number;
    change?: number;
    changePct?: number;
    trend?: 'accelerating' | 'improving' | 'stable' | 'declining' | 'deteriorating';
  };

  // Qualidade do fluxo
  qualityScore?: number; // 0-10
  anomalyDetected: boolean;
  anomalyReason?: string;

  // Resumo da análise
  fluxoSummary: string;
  fluxoSensation?: number; // 0-10
}

/**
 * Schema Zod para validação de métricas financeiras extraídas.
 */
const FinancialMetricSchema = z.object({
  name: z.string(),
  value: z.string(),
  unit: z.string().optional(),
});

/**
 * Serviço de análise de fluxo entre lançamentos de resultados.
 *
 * Responsabilidades:
 * 1. Buscar lançamentos anteriores da mesma empresa
 * 2. Comparar métricas financeiras entre lançamentos
 * 3. Calcular variações absolutas e percentuais
 * 4. Identificar tendências e anomalias
 * 5. Gerar resumo da evolução da empresa
 */
@Injectable()
export class FluxoAnalysisService {
  private readonly logger = new Logger(FluxoAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataExtractionService: DataExtractionService,
  ) {
    this.logger.log('FluxoAnalysisService initialized');
  }

  /**
   * Analisa o fluxo entre lançamentos para um dado arquivo.
   * Compara com o lançamento anterior da mesma empresa.
   */
  async analyzeFluxo(fileId: string): Promise<FluxoAnalysisResult> {
    this.logger.log(`Starting fluxo analysis for file ${fileId}`);

    // Buscar o arquivo e sua empresa
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { company: true, analyses: true },
    });

    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    // Log detalhado para debug
    this.logger.log(`File found: ${fileId}`, {
      analysesCount: file.analyses?.length || 0,
      firstAnalysisPeriod: file.analyses?.[0]?.period,
    });

    // Buscar a seção com dados extraídos (RawExtractionData)
    const sections = await this.prisma.section.findMany({
      where: {
        fileId,
        type: 'NORMAL',
      },
      orderBy: { orderIndex: 'asc' },
    });

    if (sections.length === 0) {
      throw new Error(`No NORMAL sections found for file ${fileId}`);
    }

    // Extrair dados de todas as seções
    const allExtractedData: Array<{ name: string; value: string; unit?: string }> = [];
    for (const section of sections) {
      const sectionData = typeof section.data === 'string' ? JSON.parse(section.data) : section.data;
      const extractedItems = sectionData.extractedItems || sectionData.extractedData || [];
      allExtractedData.push(...extractedItems);
    }

    this.logger.log(`Extracted ${allExtractedData.length} data points for fluxo analysis`);

    // Buscar o período do último Analysis associado a este arquivo
    // Fallback: usar o período extraído do File (se não houver análise)
    const analyses = file.analyses || [];
    const currentPeriod = analyses[0]?.period ?? file.period ?? '';
    if (!currentPeriod) {
      this.logger.warn(`No period found in analyses or file for file ${fileId} (analyses count: ${analyses.length})`);
    }

    // Buscar lançamentos anteriores da mesma empresa
    const previousAnalysisFile = await this.findPreviousAnalysis(file.companyId, currentPeriod, fileId);

    // Processar métricas financeiras
    const processedMetrics = this.processFinancialMetrics(allExtractedData, currentPeriod);

    // Comparar com lançamento anterior se existir
    let comparisonResult: any = {};
    let comparisonType: 'YOY' | 'QOQ' | 'sequential' = 'sequential';

    if (previousAnalysisFile) {
      const previousPeriod = previousAnalysisFile.analyses?.[0]?.period;
      if (previousPeriod && currentPeriod) {
        comparisonType = this.determineComparisonType(currentPeriod, previousPeriod);
        comparisonResult = this.compareWithPrevious(processedMetrics, previousAnalysisFile);
      } else {
        // Sem comparison possível, apenas dados atuais
        comparisonResult = processedMetrics;
      }
    } else if (currentPeriod && currentPeriod.trim() !== '') {
      // Primeiro lançamento com período válido - apenas dados atuais
      comparisonResult = processedMetrics;
    } else {
      // Sem período válido, não é possível fazer análise de fluxo
      comparisonResult = processedMetrics;
    }

    // Calcular qualidade e detectar anomalias
    const qualityScore = this.calculateQualityScore(processedMetrics, allExtractedData.length);
    const { anomalyDetected, anomalyReason } = this.detectAnomalies(comparisonResult);

    // Gerar resumo da análise
    const previousPeriodForSummary = previousAnalysisFile?.analyses?.[0]?.period ?? '';
    const fluxoSummary = this.generateFluxoSummary(comparisonResult, currentPeriod, previousPeriodForSummary);

    // Calcular sentimento do fluxo
    const fluxoSensation = this.calculateFluxoSensation(comparisonResult);

    this.logger.log(`Fluxo analysis completed for file ${fileId}`);

    return {
      currentAnalysisId: fileId,
      previousAnalysisId: previousAnalysisFile?.analyses?.[0]?.id,
      periodComparison: previousAnalysisFile && currentPeriod.trim() !== ''
        ? `${currentPeriod} vs ${previousAnalysisFile.analyses?.[0]?.period}`
        : (currentPeriod.trim() !== '' ? `${currentPeriod} (primeiro lançamento)` : 'Sem período (primeiro lançamento)'),
      comparisonType,
      revenue: comparisonResult.revenue,
      ebitda: comparisonResult.ebitda,
      netProfit: comparisonResult.netProfit,
      fco: comparisonResult.fco,
      dividends: comparisonResult.dividends,
      qualityScore,
      anomalyDetected,
      anomalyReason,
      fluxoSummary,
      fluxoSensation,
    };
  }

  /**
   * Busca o lançamento anterior da mesma empresa.
   * Busca por: mesmo período no ano anterior (YOY), ou último disponível.
   */
  private async findPreviousAnalysis(companyId: string, currentPeriod: string, currentFileId: string) {
    // Se não houver período válido, busca o último lançamento disponível (sequential)
    if (!currentPeriod || currentPeriod.trim() === '') {
      this.logger.log(`No valid period provided, using sequential comparison without YOY`);
      // Fallback: busca o último lançamento disponível
      return this.prisma.file.findFirst({
        where: {
          companyId,
          id: { not: currentFileId },
          analyses: {
            some: {},
          },
        },
        orderBy: { uploadedAt: 'desc' },
        include: { analyses: true },
      });
    }

    // Parsear o período (ex: 1T26, 4T25)
    const periodMatch = currentPeriod.match(/^(\d)T(\d{2})$/);
    if (!periodMatch) {
      this.logger.warn(`Could not parse period: ${currentPeriod}, using sequential comparison`);
      // Fallback: busca o último lançamento disponível
      return this.prisma.file.findFirst({
        where: {
          companyId,
          id: { not: currentFileId },
          analyses: {
            some: {},
          },
        },
        orderBy: { uploadedAt: 'desc' },
        include: { analyses: true },
      });
    }

    const [_, quarterStr, yearStr] = periodMatch;
    const quarter = parseInt(quarterStr);
    const year = parseInt(yearStr);

    // Buscar por YOY (same quarter, previous year)
    const prevYear = year - 1;
    const prevYearPeriod = `${quarterStr}T${prevYear.toString().padStart(2, '0')}`;

    const yoyComparison = await this.prisma.file.findFirst({
      where: {
        companyId,
        analyses: {
          some: {
            period: prevYearPeriod,
          },
        },
      },
      orderBy: { uploadedAt: 'desc' },
      include: { analyses: true },
    });

    if (yoyComparison) {
      return yoyComparison;
    }

    // Fallback: busca o último lançamento disponível
    return this.prisma.file.findFirst({
      where: {
        companyId,
        id: { not: currentFileId },
        analyses: {
          some: {},
        },
      },
      orderBy: { uploadedAt: 'desc' },
      include: { analyses: true },
    });
  }

  /**
   * Processa os dados extraídos e normaliza para métricas financeiras padronizadas.
   */
  private processFinancialMetrics(
    extractedData: Array<{ name: string; value: string; unit?: string }>,
    period: string,
  ): {
    revenue?: { current: number };
    ebitda?: { current: number };
    netProfit?: { current: number };
    fco?: { current: number };
    dividends?: { current: number };
  } {
    const metrics: Record<string, number> = {};

    for (const item of extractedData) {
      const normalizedKey = this.normalizeMetricName(item.name);
      const value = this.parseFinancialValue(item.value, item.unit);

      if (value !== null) {
        metrics[normalizedKey] = value;
      }
    }

    const result: any = {};

    // Mapear métricas padrão
    if (metrics.receitaliquida || metrics.receita) result.revenue = { current: metrics.receitaliquida || metrics.receita };
    if (metrics.ebitda) result.ebitda = { current: metrics.ebitda };
    if (metrics.lucroliquido) result.netProfit = { current: metrics.lucroliquido };
    if (metrics.fluxocaixaoperacional || metrics.fco) result.fco = { current: metrics.fluxocaixaoperacional || metrics.fco };
    if (metrics.dividendos || metrics.dividendospagos) result.dividends = { current: metrics.dividendos || metrics.dividendospagos };

    return result;
  }

  /**
   * Compara métricas atuais com o lançamento anterior.
   * Extrai métricas do fluxoAnalysis anterior ou do Analysis antigo.
   */
  private compareWithPrevious(
    currentMetrics: any,
    previousFile: any,
  ): {
    revenue?: { current: number; previous: number; change: number; changePct: number; trend: string };
    ebitda?: { current: number; previous: number; change: number; changePct: number; trend: string };
    netProfit?: { current: number; previous: number; change: number; changePct: number; trend: string };
    fco?: { current: number; previous: number; change: number; changePct: number; trend: string };
    dividends?: { current: number; previous: number; change: number; changePct: number; trend: string };
  } {
    // Tenta extrair de fluxoAnalysis primeiro, depois de Analysis
    const previousMetrics = this.extractMetricsFromFile(previousFile);

    const result: any = {};

    const compareMetric = (key: string, current: number, previous: number) => {
      const change = current - previous;
      const changePct = previous !== 0 ? (change / previous) * 100 : 0;
      const trend = this.determineTrend(changePct);

      result[key] = {
        current,
        previous,
        change,
        changePct,
        trend,
      };
    };

    if (currentMetrics.revenue && previousMetrics.revenue) {
      compareMetric('revenue', currentMetrics.revenue.current, previousMetrics.revenue.current);
    }

    if (currentMetrics.ebitda && previousMetrics.ebitda) {
      compareMetric('ebitda', currentMetrics.ebitda.current, previousMetrics.ebitda.current);
    }

    if (currentMetrics.netProfit && previousMetrics.netProfit) {
      compareMetric('netProfit', currentMetrics.netProfit.current, previousMetrics.netProfit.current);
    }

    if (currentMetrics.fco && previousMetrics.fco) {
      compareMetric('fco', currentMetrics.fco.current, previousMetrics.fco.current);
    }

    if (currentMetrics.dividends && previousMetrics.dividends) {
      compareMetric('dividends', currentMetrics.dividends.current, previousMetrics.dividends.current);
    }

    return result;
  }

  /**
   * Determina o tipo de comparação baseado nos períodos.
   */
  private determineComparisonType(currentPeriod: string, previousPeriod: string): 'YOY' | 'QOQ' | 'sequential' {
    const currentMatch = currentPeriod.match(/^(\d)T(\d{2})$/);
    const previousMatch = previousPeriod.match(/^(\d)T(\d{2})$/);

    if (!currentMatch || !previousMatch) return 'sequential';

    const [_, currentQuarter, currentYear] = currentMatch;
    const [__, prevQuarter, prevYear] = previousMatch;

    if (currentYear !== prevYear) {
      return 'YOY'; // Mesmo trimestre, ano diferente
    }

    const quarterDiff = parseInt(currentQuarter) - parseInt(prevQuarter);
    if (Math.abs(quarterDiff) === 1) {
      return 'QOQ'; // Trimestres consecutivos
    }

    return 'sequential';
  }

  /**
   * Determina a tendência baseada na variação percentual.
   */
  private determineTrend(changePct: number): 'accelerating' | 'improving' | 'stable' | 'declining' | 'deteriorating' {
    // Thresholds configuráveis
    const positiveHigh = 20;   // >20% crescimento
    const positiveLow = 5;     // 5-20% crescimento
    const stableHigh = 5;      // -5 a +5% estável
    const negativeLow = -5;    // -5 a -20% piorando
    const negativeHigh = -20;  // <-20% piorando muito

    if (changePct > positiveHigh) return 'accelerating';
    if (changePct > positiveLow) return 'improving';
    if (changePct >= stableHigh) return 'stable';
    if (changePct > negativeHigh) return 'declining';
    return 'deteriorating';
  }

  /**
   * Calcula score de qualidade baseado na completude dos dados.
   */
  private calculateQualityScore(
    metrics: any,
    totalDataPoints: number,
  ): number {
    // Pontuação baseada em:
    // 1. Quantidade de dados extraídos (até 40 pontos)
    // 2. Métricas financeiras principais presentes (até 60 pontos)

    let score = 0;

    // Pontos por quantidade de dados (máx 40)
    if (totalDataPoints >= 50) score += 40;
    else if (totalDataPoints >= 20) score += 30;
    else if (totalDataPoints >= 10) score += 20;
    else if (totalDataPoints > 0) score += 10;

    // Pontos por métricas principais (máx 60)
    const keyMetrics = ['revenue', 'ebitda', 'netProfit', 'fco', 'dividends'];
    const presentMetrics = keyMetrics.filter(m => metrics[m]);
    score += (presentMetrics.length / keyMetrics.length) * 60;

    return Math.round(score);
  }

  /**
   * Detecta anomalias nos dados comparativos.
   */
  private detectAnomalies(comparison: any): { anomalyDetected: boolean; anomalyReason?: string } {
    const anomalies: string[] = [];

    // Verificar variações extremas (>100% ou <-50%)
    const checkAnomaly = (key: string, label: string) => {
      const metric = comparison[key];
      if (metric && (Math.abs(metric.changePct) > 100 || metric.changePct < -50)) {
        anomalies.push(`${label}: variação de ${metric.changePct.toFixed(1)}%`);
      }
    };

    checkAnomaly('revenue', 'Receita');
    checkAnomaly('ebitda', 'EBITDA');
    checkAnomaly('netProfit', 'Lucro Líquido');
    checkAnomaly('fco', 'FCO');
    checkAnomaly('dividends', 'Dividendos');

    return {
      anomalyDetected: anomalies.length > 0,
      anomalyReason: anomalies.length > 0 ? anomalies.join('; ') : undefined,
    };
  }

  /**
   * Gera resumo da análise de fluxo.
   */
  private generateFluxoSummary(
    comparison: any,
    currentPeriod: string,
    previousPeriod?: string,
  ): string {
    const summaries: string[] = [];

    // Resumo de receita
    if (comparison.revenue) {
      const r = comparison.revenue;
      const trendPhrase = this.getTrendPhrase(r.trend);
      summaries.push(`Receita ${trendPhrase} ${r.changePct > 0 ? '+' : ''}${r.changePct.toFixed(1)}%`);
    }

    // Resumo de lucro
    if (comparison.netProfit) {
      const p = comparison.netProfit;
      const trendPhrase = this.getTrendPhrase(p.trend);
      summaries.push(`Lucro Líquido ${trendPhrase} ${p.changePct > 0 ? '+' : ''}${p.changePct.toFixed(1)}%`);
    }

    // Resumo de EBITDA
    if (comparison.ebitda) {
      const e = comparison.ebitda;
      const trendPhrase = this.getTrendPhrase(e.trend);
      summaries.push(`EBITDA ${trendPhrase} ${e.changePct > 0 ? '+' : ''}${e.changePct.toFixed(1)}%`);
    }

    if (summaries.length === 0) {
      return `Análise do período ${currentPeriod} - dados insuficientes para comparação`;
    }

    return `O fluxo de resultados mostra ${summaries.join(', ').toLowerCase()}.`;
  }

  /**
   * Converte tendência em frase descritiva.
   */
  private getTrendPhrase(trend: string): string {
    const phrases: Record<string, string> = {
      accelerating: 'acelerando positivamente',
      improving: 'melhorando',
      stable: 'estável',
      declining: 'decrescendo',
      deteriorating: 'piorando significativamente',
    };
    return phrases[trend] || 'em evolução';
  }

  /**
   * Calcula sentimento do fluxo baseado nas métricas comparativas.
   */
  private calculateFluxoSensation(comparison: any): number {
    if (Object.keys(comparison).length === 0) return 5; // Neutro

    let score = 5; // Base neutro 0-10

    // Analisar direção de cada métrica
    let positiveCount = 0;
    let negativeCount = 0;

    Object.values(comparison).forEach((m: any) => {
      if (m.changePct > 0) positiveCount++;
      else if (m.changePct < 0) negativeCount++;
    });

    // Ajustar score baseado em proporção
    const total = positiveCount + negativeCount;
    if (total > 0) {
      const positiveRatio = positiveCount / total;
      score = Math.round(positiveRatio * 10);
    }

    // Penalizar se muitas métricas estão piorando
    if (negativeCount > positiveCount && negativeCount >= 2) {
      score = Math.max(1, score - 2);
    }

    // Bonus se todas estão melhorando
    if (positiveCount > 0 && negativeCount === 0) {
      score = Math.min(10, score + 1);
    }

    return score;
  }

  /**
   * Normaliza nomes de métricas para padronização.
   */
  private normalizeMetricName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // Remove acentos
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Parses valor financeiro com unidade (ex: "1.234", "500 milhões", "2.5 bilhões").
   */
  private parseFinancialValue(value: string, unit?: string): number | null {
    try {
      // Limpar valor (remover pontuação de milhar, converter vírgula)
      let cleanValue = value
        .replace(/\./g, '') // Remove pontos de milhar
        .replace(',', '.') // Converte vírgula para ponto decimal
        .trim();

      // Aplicar fatores de unidade
      if (unit) {
        const unitLower = unit.toLowerCase();

        if (unitLower.includes('bilh') || unitLower.includes('billion')) {
          cleanValue = (parseFloat(cleanValue) * 1e9).toString();
        } else if (unitLower.includes('milh') || unitLower.includes('million')) {
          cleanValue = (parseFloat(cleanValue) * 1e6).toString();
        } else if (unitLower.includes('mil') && !unitLower.includes('bilh')) {
          cleanValue = (parseFloat(cleanValue) * 1e3).toString();
        }
      }

      const num = parseFloat(cleanValue);
      return isNaN(num) ? null : num;
    } catch {
      return null;
    }
  }

  /**
   * Extrai métricas de um arquivo (File) que pode ter Analysis ou FluxoAnalysis.
   */
  private extractMetricsFromFile(file: any): any {
    if (!file) return {};

    // Fallback: extrair de Analysis
    const result: any = {};
    const analysis = file.analyses?.[0];

    if (analysis) {
      if (analysis.revenue !== null && analysis.revenue !== undefined) {
        result.revenue = { current: analysis.revenue };
      }
      if (analysis.ebitda !== null && analysis.ebitda !== undefined) {
        result.ebitda = { current: analysis.ebitda };
      }
      if (analysis.netProfit !== null && analysis.netProfit !== undefined) {
        result.netProfit = { current: analysis.netProfit };
      }
      if (analysis.fco !== null && analysis.fco !== undefined) {
        result.fco = { current: analysis.fco };
      }
      if (analysis.dividends !== null && analysis.dividends !== undefined) {
        result.dividends = { current: analysis.dividends };
      }
    }

    return result;
  }
}
