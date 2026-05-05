import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DailySnapshotJob {
  private readonly logger = new Logger(DailySnapshotJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_6PM)
  async runDailySnapshot() {
    this.logger.log('Running daily snapshot job. ..');

    const tickers = await this.prisma.assetStateSnapshot.groupBy({
      by: ['assetTicker'],
    });

    const tickersArray = tickers.map((t) => t.assetTicker);

    for (const ticker of tickersArray) {
      const lastSnapshot = await this.prisma.assetStateSnapshot.findFirst({
        where: { assetTicker: ticker },
        orderBy: { timestamp: 'desc' },
      });

      // Simulação: buscar métrica fundamental atual via Yahoo Finance
      const currentMetric = await this.getFundamentalFromYahooFinance(ticker);

      const previousMetric = lastSnapshot?.fundamentalScore
        ? (lastSnapshot.fundamentalScore / 10) * (lastSnapshot.timestamp.getTime() / 1000)
        : currentMetric;

      const fundamentalScore =
        currentMetric && previousMetric
          ? ((currentMetric - previousMetric) / previousMetric * 10).toFixed(2)
          : '0.00';

      await this.prisma.assetStateSnapshot.upsert({
        where: { assetTicker: ticker },
        update: {
          fundamentalScore: parseFloat(fundamentalScore),
          consolidatedScore: parseFloat(fundamentalScore),
          triggerSource: 'FUNDAMENTAL' as const,
          triggerReason: `Daily snapshot - Fundamental update for ${ticker}`,
        },
        create: {
          assetTicker: ticker,
          fundamentalScore: parseFloat(fundamentalScore),
          consolidatedScore: parseFloat(fundamentalScore),
          triggerSource: 'FUNDAMENTAL' as const,
          triggerReason: `Daily snapshot - Initial fundamental for ${ticker}`,
        },
      });

      this.logger.log(`Updated snapshot for ${ticker}`);
    }

    this.logger.log('Daily snapshot job completed');
  }

  private async getFundamentalFromYahooFinance(ticker: string): Promise<number> {
    // Implementação real usando yahoo-finance2
    // return await yahooFinance2.quote(`${ticker}`);
    return 20; // Mock para desenvolvimento
  }
}
