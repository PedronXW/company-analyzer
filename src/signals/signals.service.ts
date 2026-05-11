import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSignalDto } from './dto/create-signal.schema';

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recebe e processa um Signal do news-analyzer.
   *
   * @param dto - CreateSignalDto com ticker, source, score e reasoning
   * @returns Signal criado
   */
  async createSignal(dto: CreateSignalDto): Promise<CreateSignalDto & { id: string; processed: boolean }> {
    this.logger.debug(
      `Receiving signal for ticker ${dto.ticker}: ${dto.reasoning}`,
    );

    // Buscar empresa pelo ticker
    const company = await this.prisma.company.findFirst({
      where: { ticker: dto.ticker },
    });

    const signal = await this.prisma.signal.create({
      data: {
        ticker: dto.ticker,
        source: dto.source,
        score: dto.score,
        reasoning: dto.reasoning,
        processed: false,
        companyId: company?.id,
      },
    });

    this.logger.log(
      `Signal created for ticker ${dto.ticker}: id=${signal.id}, source=${signal.source}, score=${signal.score}`,
    );

    return {
      id: signal.id,
      ticker: signal.ticker,
      source: signal.source,
      score: signal.score,
      reasoning: signal.reasoning ?? undefined,
      processed: signal.processed,
    };
  }

  /**
   * Processa um Signal (vincula a uma Analysis).
   *
   * @param signalId - ID do Signal
   * @param analysisId - ID da Analysis que será vinculada
   * @returns Signal atualizado
   */
  async processSignal(
    signalId: string,
    analysisId: string,
  ): Promise<SignalWithAnalysis> {
    // Verificar se o Signal existe
    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
    });

    if (!signal) {
      throw new Error(`Signal with id ${signalId} not found`);
    }

    // Verificar se a Analysis existe
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      throw new Error(`Analysis with id ${analysisId} not found`);
    }

    // Vincular Signal à Analysis
    await this.prisma.analysisSignal.create({
      data: {
        analysisId,
        signalId,
      },
    });

    // Atualizar Signal como processado
    const updatedSignal = await this.prisma.signal.update({
      where: { id: signalId },
      data: { processed: true },
    });

    this.logger.log(
      `Signal ${signalId} processed and linked to analysis ${analysisId}`,
    );

    return {
      ...updatedSignal,
      analyses: [],
      company: null,
    };
  }

  /**
   * Busca todos os Signals com seus relacionamentos.
   */
  async findAll(): Promise<SignalWithAnalysis[]> {
    return this.prisma.signal.findMany({
      include: {
        analyses: true,
        company: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca Signals por ticker.
   */
  async findByTicker(ticker: string): Promise<SignalWithAnalysis[]> {
    return this.prisma.signal.findMany({
      where: { ticker },
      include: {
        analyses: true,
        company: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

type SignalWithAnalysis = {
  id: string;
  ticker: string;
  source: string;
  score: number;
  reasoning: string | null;
  processed: boolean;
  createdAt: Date;
  updatedAt: Date;
  companyId: string | null;
  analyses: Array<{ analysisId: string; signalId: string }>;
  company: {
    id: string;
    ticker: string;
    name: string | null;
    sector: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};
