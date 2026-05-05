import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SignalService {
  constructor(private readonly prisma: PrismaService) {}

  async processFundamentalSignal(
    signal: {
      ticker: string;
      peRatio?: number;
      pbRatio?: number;
      debtToEquity?: number;
      revenueGrowth?: number;
    },
    reasoning?: string,
  ) {
    const { ticker, peRatio, pbRatio, debtToEquity, revenueGrowth } = signal;

    const lastSnapshot = await this.prisma.assetStateSnapshot.findFirst({
      where: { assetTicker: ticker },
      orderBy: { timestamp: 'desc' },
    });

    const previousPE = lastSnapshot?.fundamentalScore
      ? (lastSnapshot.fundamentalScore / 10) * (lastSnapshot.timestamp.getTime() / 1000)
      : peRatio;

    const fundamentalScore =
      peRatio && previousPE
        ? ((peRatio - previousPE) / previousPE * 10).toFixed(2)
        : '0.00';

    const newSnapshot = await this.prisma.assetStateSnapshot.create({
      data: {
        assetTicker: ticker,
        fundamentalScore: parseFloat(fundamentalScore),
        consolidatedScore: parseFloat(fundamentalScore),
        triggerSource: 'FUNDAMENTAL' as const,
        triggerReason: reasoning || `Fundamental metrics updated for ${ticker}`,
      },
    });

    return {
      status: 'success',
      message: 'Fundamental signal processed successfully',
      data: { snapshot: newSnapshot },
    };
  }
}
